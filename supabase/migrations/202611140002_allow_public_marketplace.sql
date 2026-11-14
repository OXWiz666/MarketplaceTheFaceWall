-- The public marketplace uses the Supabase publishable/anon key when no
-- server-only service key is configured. Keep buyer messages private.
grant usage on schema public to anon;
grant select, insert on public.listings to anon;
grant insert on public.seller_messages to anon;

drop policy if exists "Marketplace listings are public" on public.listings;
create policy "Marketplace listings are public"
  on public.listings for select to anon
  using (true);

drop policy if exists "Visitors can create validated listings" on public.listings;
create policy "Visitors can create validated listings"
  on public.listings for insert to anon
  with check (
    char_length(btrim(title)) between 3 and 120
    and char_length(btrim(description)) between 10 and 3000
    and price >= 0
    and category in ('Electronics','Vehicles','Home & Furniture','Fashion','Sports & Outdoors','Books','Collectibles','Other')
    and char_length(email) between 3 and 254
  );

drop policy if exists "Visitors can send listing messages" on public.seller_messages;
create policy "Visitors can send listing messages"
  on public.seller_messages for insert to anon
  with check (
    char_length(btrim(buyer_name)) between 2 and 100
    and char_length(buyer_email) between 3 and 254
    and char_length(btrim(message)) between 5 and 2000
    and exists (select 1 from public.listings where listings.id = seller_messages.listing_id)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-images', 'marketplace-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Marketplace images are publicly readable" on storage.objects;
create policy "Marketplace images are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'marketplace-images');

drop policy if exists "Visitors can upload uniquely named marketplace images" on storage.objects;
create policy "Visitors can upload uniquely named marketplace images"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'marketplace-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  );
