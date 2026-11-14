create extension if not exists pgcrypto;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  price numeric(12,2) not null check (price >= 0),
  email text not null check (char_length(email) between 3 and 254),
  category text not null check (category in ('Electronics','Vehicles','Home & Furniture','Fashion','Sports & Outdoors','Books','Collectibles','Other')),
  image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists listings_category_created_idx on public.listings (category, created_at desc);
create index if not exists listings_created_idx on public.listings (created_at desc);

create table if not exists public.seller_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_name text not null check (char_length(btrim(buyer_name)) between 2 and 100),
  buyer_email text not null check (char_length(buyer_email) between 3 and 254),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists seller_messages_listing_idx on public.seller_messages (listing_id, created_at desc);

alter table public.listings enable row level security;
alter table public.seller_messages enable row level security;

-- Anonymous browser clients have no table permissions. The server uses the
-- service-role key, kept private, after validating every public request.
revoke all on public.listings from anon, authenticated;
revoke all on public.seller_messages from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-images', 'marketplace-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Public image reads support product thumbnails; anonymous uploads and deletes
-- stay disabled. Uploads are performed by the server after inspecting file bytes.
drop policy if exists "Marketplace images are publicly readable" on storage.objects;
create policy "Marketplace images are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'marketplace-images');
