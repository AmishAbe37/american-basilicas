-- American Basilicas — member accounts
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query), then run seed_basilicas.sql.
-- Safe to re-run: every statement is idempotent.
--
-- What it sets up
--   basilicas  the 94 basilicas, keyed by the map's slug (read-only for everyone)
--   profiles   one row per member: the display name shown under their gallery photos
--   visits     a member's check-off of a basilica (date + private note)
--   photos     photos attached to a visit; shared in the members' gallery only once approved
--   admins     who may approve photos (add yourself after signing up — see SETUP.md)
--   storage    private bucket "member-photos", files at <user id>/<basilica id>/<photo id>.jpg (+ .t.jpg thumbnail)
--
-- Security model (row-level security is on for every table)
--   • A member reads and writes only their own visits and photos.
--   • Signed-in members can see other members' photos only when approved, plus the uploader's display name.
--   • Signed-out visitors can read the basilica list and nothing else.
--   • Nobody can approve their own photo; approval goes through review_photo(), which checks admins.

-- ---------------------------------------------------------------- basilicas
create table if not exists public.basilicas (
  id    text primary key,                 -- slug, e.g. 'st-louis-cathedral-basilica-of-st-louis'
  name  text not null,
  city  text not null,
  state text not null,
  lat   double precision not null,
  lng   double precision not null
);
alter table public.basilicas enable row level security;
drop policy if exists "basilicas are public" on public.basilicas;
create policy "basilicas are public" on public.basilicas for select using (true);

-- ---------------------------------------------------------------- admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;     -- no policies: invisible to the API

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pilgrim'
               check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "members see member names" on public.profiles;
create policy "members see member names" on public.profiles for select to authenticated using (true);
drop policy if exists "members rename themselves" on public.profiles;
create policy "members rename themselves" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- a profile is created automatically at sign-up; the name starts as the first word of their Google name, else "Pilgrim"
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  nm := split_part(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), ' ', 1);
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(trim(nm), 40), ''), 'Pilgrim'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- visits
create table if not exists public.visits (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  basilica_id text not null references public.basilicas(id),
  visited_on  date check (visited_on is null or visited_on between date '1900-01-01' and current_date + 1),
  note        text check (note is null or char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  primary key (user_id, basilica_id)
);
alter table public.visits enable row level security;
drop policy if exists "own visits" on public.visits;
create policy "own visits" on public.visits for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.visits to authenticated;

-- ---------------------------------------------------------------- photos
do $$ begin
  create type public.photo_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  basilica_id  text not null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[a-z0-9-]+/[a-z0-9-]+\.jpg$'),
  thumb_path   text generated always as (regexp_replace(storage_path, '\.jpg$', '.t.jpg')) stored,  -- 480 px copy for grids
  caption      text check (caption is null or char_length(caption) <= 300),
  width        int,
  height       int,
  status       public.photo_status not null default 'pending',
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  foreign key (user_id, basilica_id) references public.visits(user_id, basilica_id) on delete cascade,
  -- the file must sit in the uploader's own folder for this basilica
  check (storage_path like (user_id::text || '/' || basilica_id || '/%'))
);
create index if not exists photos_status_created on public.photos (status, created_at desc);
create index if not exists photos_basilica on public.photos (basilica_id) where status = 'approved';
alter table public.photos enable row level security;

drop policy if exists "own photos" on public.photos;
create policy "own photos" on public.photos for select to authenticated using (user_id = auth.uid());
drop policy if exists "approved photos for members" on public.photos;
create policy "approved photos for members" on public.photos for select to authenticated using (status = 'approved');
drop policy if exists "admins see all photos" on public.photos;
create policy "admins see all photos" on public.photos for select to authenticated using (public.is_admin());
drop policy if exists "add own photo" on public.photos;
create policy "add own photo" on public.photos for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_at is null);
drop policy if exists "edit own caption" on public.photos;
create policy "edit own caption" on public.photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own photo" on public.photos;
create policy "delete own photo" on public.photos for delete to authenticated using (user_id = auth.uid());
drop policy if exists "admins delete photos" on public.photos;
create policy "admins delete photos" on public.photos for delete to authenticated using (public.is_admin());

revoke insert, update on public.photos from anon, authenticated;
grant select, delete on public.photos to authenticated;
grant insert (basilica_id, storage_path, caption, width, height) on public.photos to authenticated;
grant update (caption) on public.photos to authenticated;          -- status changes only via review_photo()

-- a changed caption goes back into the queue (otherwise an approved photo could be re-captioned freely)
create or replace function public.photos_caption_requeue() returns trigger
language plpgsql as $$
begin
  if new.caption is distinct from old.caption and not public.is_admin() then
    new.status := 'pending'; new.reviewed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists photos_caption_requeue on public.photos;
create trigger photos_caption_requeue before update of caption on public.photos
  for each row execute function public.photos_caption_requeue();

-- at most 30 photos per member per basilica
create or replace function public.photos_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.photos where user_id = new.user_id and basilica_id = new.basilica_id) >= 30 then
    raise exception 'You can add up to 30 photos for each basilica.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists photos_limit on public.photos;
create trigger photos_limit before insert on public.photos
  for each row execute function public.photos_limit();

-- admin review: approve or reject; only admins, never on their own pending queue bypass
create or replace function public.review_photo(photo_id uuid, decision public.photo_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if decision = 'pending' then raise exception 'decision must be approved or rejected'; end if;
  update public.photos set status = decision, reviewed_at = now() where id = photo_id;
end $$;
revoke all on function public.review_photo(uuid, public.photo_status) from public;
grant execute on function public.review_photo(uuid, public.photo_status) to authenticated;

-- photo count per basilica for the gallery filter (runs as the caller, so it only counts what they may see)
create or replace function public.gallery_counts() returns table (basilica_id text, n bigint)
language sql stable security invoker set search_path = public as $$
  select basilica_id, count(*) from public.photos where status = 'approved' group by basilica_id;
$$;
revoke all on function public.gallery_counts() from public, anon;
grant execute on function public.gallery_counts() to authenticated;

-- signed-out visitors get nothing from the member tables (RLS would return no rows anyway; this makes it explicit)
revoke all on public.profiles, public.visits, public.photos, public.admins from anon;
revoke execute on function public.review_photo(uuid, public.photo_status) from anon;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 6291456, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 6291456, allowed_mime_types = array['image/jpeg'];

drop policy if exists "member photos: upload to own folder" on storage.objects;
create policy "member photos: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "member photos: read own" on storage.objects;
create policy "member photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "member photos: read approved" on storage.objects;
create policy "member photos: read approved" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos'
         and exists (select 1 from public.photos p
                     where p.status = 'approved' and storage.objects.name in (p.storage_path, p.thumb_path)));
drop policy if exists "member photos: admins read" on storage.objects;
create policy "member photos: admins read" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and public.is_admin());
drop policy if exists "member photos: delete own" on storage.objects;
create policy "member photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "member photos: admins delete" on storage.objects;
create policy "member photos: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and public.is_admin());
