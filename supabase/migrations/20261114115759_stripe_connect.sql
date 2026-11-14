-- Run this complete file in the SQL Editor. The payment tables enable RLS below.
-- Stripe data is accessible only to the server's service role.
alter table public.listings
  add column if not exists seller_email_normalized text generated always as (lower(btrim(email))) stored,
  add column if not exists status text not null default 'active' check (status in ('active', 'reserved', 'sold')),
  add column if not exists sold_at timestamptz;

do $listing_sold_at_constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.listings'::regclass and conname = 'listings_sold_at_check'
  ) then
    alter table public.listings add constraint listings_sold_at_check
      check ((status = 'sold') = (sold_at is not null));
  end if;
end;
$listing_sold_at_constraint$;

create index if not exists listings_seller_email_idx on public.listings (seller_email_normalized);
revoke insert on public.listings from anon;
grant insert (title, description, price, email, category, image_path) on public.listings to anon;

create table if not exists public.seller_stripe_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  stripe_account_id text unique,
  onboarding_complete boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  card_payments_active boolean not null default false,
  action_required boolean not null default false,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default '-infinity'
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  seller_account_id uuid not null references public.seller_stripe_accounts(id),
  attempt_id uuid not null unique,
  buyer_email text,
  amount integer not null check (amount between 1 and 99999999),
  platform_fee integer not null check (platform_fee >= 0 and platform_fee <= amount),
  seller_amount integer generated always as (amount - platform_fee) stored,
  currency text not null default 'php' check (currency = 'php'),
  product_title text not null,
  image_url text not null,
  app_origin text not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_connected_account_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);
create unique index if not exists orders_current_listing_idx on public.orders (listing_id)
  where status in ('pending', 'paid', 'refunded');
create index if not exists orders_listing_idx on public.orders (listing_id);
create index if not exists orders_seller_date_idx on public.orders (seller_account_id, created_at desc);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  stripe_account_id text not null,
  processed_at timestamptz not null default now()
);

alter table public.seller_stripe_accounts enable row level security;
alter table public.orders enable row level security;
alter table public.stripe_webhook_events enable row level security;
revoke all on public.seller_stripe_accounts, public.orders, public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on public.seller_stripe_accounts, public.orders to service_role;
grant select, insert on public.stripe_webhook_events to service_role;
grant select, update on public.listings to service_role;

create or replace function public.reserve_marketplace_checkout(
  p_listing uuid, p_seller uuid, p_account text, p_attempt uuid,
  p_bps integer, p_origin text, p_image_base text
) returns jsonb language plpgsql set search_path = '' as $reserve_marketplace_checkout$
declare
  item public.listings;
  checkout public.orders;
  total numeric;
  fee integer;
begin
  -- Every listing/order mutation takes the listing lock first.
  item := (select listing from public.listings as listing where listing.id = p_listing for update);
  if item.id is null or item.status = 'sold' then return null; end if;

  checkout := (select pending_order from public.orders as pending_order
    where pending_order.listing_id = p_listing and pending_order.status = 'pending');
  if checkout.id is not null then
    if checkout.attempt_id = p_attempt then return to_jsonb(checkout); end if;
    return null;
  end if;
  if item.status <> 'active' then return null; end if;
  if not exists (
    select 1 from public.seller_stripe_accounts
    where id = p_seller and stripe_account_id = p_account
      and email = item.seller_email_normalized and onboarding_complete
      and charges_enabled and card_payments_active
  ) then return null; end if;

  total := item.price * 100;
  if total < 50 or total > 99999999 or p_bps < 0 or p_bps > 10000 then return null; end if;
  fee := round(total * p_bps / 10000)::integer;

  insert into public.orders (
    listing_id, seller_account_id, stripe_connected_account_id, attempt_id,
    amount, platform_fee, product_title, image_url, app_origin, expires_at
  ) values (
    p_listing, p_seller, p_account, p_attempt, total::integer, fee, item.title,
    p_image_base || item.image_path, p_origin, date_trunc('second', now()) + interval '40 minutes'
  ) on conflict (attempt_id) do nothing returning * into checkout;
  if not found then return null; end if;

  update public.listings set status = 'reserved' where id = p_listing;
  return to_jsonb(checkout);
end;
$reserve_marketplace_checkout$;

create or replace function public.finish_marketplace_checkout(
  p_order uuid, p_listing uuid, p_account text, p_session text, p_amount integer, p_currency text,
  p_outcome text, p_intent text, p_email text, p_event text, p_event_type text
) returns text language plpgsql set search_path = '' as $finish_marketplace_checkout$
declare
  item public.listings;
  checkout public.orders;
begin
  item := (select listing from public.listings as listing where listing.id = p_listing for update);
  if item.id is null then return 'ignored'; end if;
  checkout := (select purchase from public.orders as purchase
    where purchase.id = p_order and purchase.listing_id = p_listing for update);
  if checkout.id is null or checkout.stripe_connected_account_id is distinct from p_account
    or (checkout.stripe_checkout_session_id is not null and checkout.stripe_checkout_session_id is distinct from p_session)
    or checkout.amount is distinct from p_amount or checkout.currency is distinct from p_currency then
    return 'ignored';
  end if;
  if checkout.status <> 'pending' or item.status <> 'reserved' then return 'ignored'; end if;
  if p_outcome is null or p_outcome not in ('paid', 'failed', 'cancelled', 'expired') then return 'ignored'; end if;
  if p_outcome = 'paid' and (p_session is null or p_intent is null) then return 'ignored'; end if;
  if p_session is null and p_outcome <> 'expired' then return 'ignored'; end if;
  if p_session is null and p_outcome = 'expired' and now() < checkout.expires_at then return 'ignored'; end if;

  if p_event is not null then
    insert into public.stripe_webhook_events (id, event_type, stripe_account_id)
    values (p_event, p_event_type, p_account) on conflict do nothing;
    if not found then return 'ignored'; end if;
  end if;

  update public.orders
  set status = p_outcome,
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session),
      buyer_email = case when p_outcome = 'paid' then p_email end,
      stripe_payment_intent_id = case when p_outcome = 'paid' then p_intent end,
      paid_at = case when p_outcome = 'paid' then now() end
  where id = p_order;
  update public.listings
  set status = case when p_outcome = 'paid' then 'sold' else 'active' end,
      sold_at = case when p_outcome = 'paid' then now() end
  where id = p_listing;
  return p_outcome;
end;
$finish_marketplace_checkout$;

create or replace function public.sync_marketplace_seller(
  p_account text, p_checked_at timestamptz, p_details boolean, p_charges boolean,
  p_payouts boolean, p_card boolean, p_action boolean, p_disabled text, p_event text
) returns void language plpgsql set search_path = '' as $sync_marketplace_seller$
begin
  if not exists (select 1 from public.seller_stripe_accounts where stripe_account_id = p_account) then return; end if;
  if p_event is not null then
    insert into public.stripe_webhook_events (id, event_type, stripe_account_id)
    values (p_event, 'account.updated', p_account) on conflict do nothing;
    if not found then return; end if;
  end if;

  update public.seller_stripe_accounts set
    details_submitted = p_details, charges_enabled = p_charges, payouts_enabled = p_payouts,
    card_payments_active = p_card, action_required = p_action, disabled_reason = p_disabled,
    onboarding_complete = p_details and p_charges and p_card, updated_at = p_checked_at
  where stripe_account_id = p_account and updated_at <= p_checked_at;
end;
$sync_marketplace_seller$;

create or replace function public.marketplace_seller_totals(p_seller uuid)
returns table (sales bigint, gross bigint, fees bigint, proceeds bigint)
language sql stable set search_path = '' as $marketplace_seller_totals$
  select count(*), coalesce(sum(amount), 0), coalesce(sum(platform_fee), 0), coalesce(sum(seller_amount), 0)
  from public.orders where seller_account_id = p_seller and status = 'paid';
$marketplace_seller_totals$;

revoke execute on function public.reserve_marketplace_checkout(uuid, uuid, text, uuid, integer, text, text),
  public.finish_marketplace_checkout(uuid, uuid, text, text, integer, text, text, text, text, text, text),
  public.sync_marketplace_seller(text, timestamptz, boolean, boolean, boolean, boolean, boolean, text, text),
  public.marketplace_seller_totals(uuid) from public, anon, authenticated;
grant execute on function public.reserve_marketplace_checkout(uuid, uuid, text, uuid, integer, text, text),
  public.finish_marketplace_checkout(uuid, uuid, text, text, integer, text, text, text, text, text, text),
  public.sync_marketplace_seller(text, timestamptz, boolean, boolean, boolean, boolean, boolean, text, text),
  public.marketplace_seller_totals(uuid) to service_role;

create or replace function public.refund_marketplace_order(
  p_order uuid, p_account text, p_intent text, p_amount integer, p_currency text, p_event text
) returns void language plpgsql set search_path = '' as $refund_marketplace_order$
begin
  perform 1 from public.orders where id = p_order and stripe_connected_account_id = p_account
    and stripe_payment_intent_id = p_intent and amount = p_amount and currency = p_currency
    and status = 'paid' for update;
  if not found then return; end if;
  insert into public.stripe_webhook_events (id, event_type, stripe_account_id)
  values (p_event, 'charge.refunded', p_account) on conflict do nothing;
  if not found then return; end if;

  -- A refunded item stays sold until a seller deliberately makes a new listing.
  update public.orders set status = 'refunded' where id = p_order;
end;
$refund_marketplace_order$;

revoke execute on function public.refund_marketplace_order(uuid, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.refund_marketplace_order(uuid, text, text, integer, text, text) to service_role;

