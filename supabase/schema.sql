-- American Basilicas — member accounts
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query), then run seed_basilicas.sql.
-- Safe to re-run: every statement is idempotent.
--
-- What it sets up
--   basilicas      the 94 basilicas, keyed by the map's slug (read-only for everyone)
--   profiles       one row per member: display name (shown with their photos and reviews), sign-up date
--   visits         a member's check-off of a basilica (date + private note)
--   photos         photos attached to a visit; shared in the members' gallery once approved
--   reviews        one review per member per basilica, written after a visit with photos; shared once approved
--   photo_likes,
--   review_likes   likes, which give the "most liked" order
--   subscriptions  gallery memberships by email (Buy Me a Coffee webhook, or access you grant by hand)
--   admins         who may approve photos and reviews (add yourself after signing up — see SETUP.md)
--   storage        private bucket "member-photos", files at <user id>/<basilica id>/<photo id>.jpg (+ .t.jpg thumbnail)
--
-- Security model (row-level security is on for every table)
--   • A member always reads and writes their own visits, photos and reviews.
--   • The members' gallery — other members' approved photos and reviews, and liking them — needs gallery access:
--     free for the first 3 months after sign-up, then for subscribers (plus admins and anyone you grant access).
--   • Signed-out visitors can read the basilica list and nothing else.
--   • Nobody can approve their own content; approval goes through moderate(), which checks admins.

-- ---------------------------------------------------------------- basilicas
create table if not exists public.basilicas (
  id    text primary key,                 -- slug, e.g. 'st-louis-cathedral-basilica-of-st-louis-new-cathedral'
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
  created_at   timestamptz not null default now(),         -- starts the 3 free months of gallery access
  welcomed_at  timestamptz                                 -- when they saw the welcome message
);
alter table public.profiles add column if not exists welcomed_at timestamptz;
alter table public.profiles enable row level security;
drop policy if exists "members see member names" on public.profiles;
create policy "members see member names" on public.profiles for select to authenticated using (true);
drop policy if exists "members rename themselves" on public.profiles;
create policy "members rename themselves" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select (id, display_name) on public.profiles to authenticated;   -- others see only the display name
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

-- ---------------------------------------------------------------- gallery membership
-- The gallery is free for 3 months from sign-up; after that it needs a membership. Memberships are matched by
-- email: the Buy Me a Coffee webhook records how long each supporter has paid for (record_membership), and you
-- can grant access by hand from the review page (admin_grant_access).
create table if not exists public.subscriptions (
  email        text primary key check (email = lower(email) and position('@' in email) > 1),
  source       text not null default 'buymeacoffee' check (source in ('buymeacoffee', 'manual')),
  status       text,                       -- last event, e.g. 'membership.started', 'membership.cancelled', 'comp'
  level        text,                       -- Buy Me a Coffee membership level name
  paid_through timestamptz,                -- gallery access lasts until this moment
  note         text,
  last_event   jsonb,                      -- the last webhook body, for troubleshooting
  updated_at   timestamptz not null default now()
);
alter table public.subscriptions enable row level security;     -- no policies: only the functions below touch it
revoke all on public.subscriptions from anon, authenticated;

-- the signed-in member's own membership: does the gallery open for them, and why
create or replace function public.membership()
returns table (access boolean, kind text, joined timestamptz, free_until timestamptz, paid_through timestamptz,
               email text, welcomed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select (a.user_id is not null) or coalesce(s.paid_through > now(), false) or (p.created_at + interval '3 months' > now()),
         case when a.user_id is not null then 'admin'
              when coalesce(s.paid_through > now(), false) then 'subscriber'
              when p.created_at + interval '3 months' > now() then 'trial'
              else 'expired' end,
         p.created_at, p.created_at + interval '3 months', s.paid_through, u.email::text, p.welcomed_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.email = lower(u.email)
  left join public.admins a on a.user_id = p.id
  where p.id = auth.uid();
$$;
create or replace function public.has_gallery_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select m.access from public.membership() m), false);
$$;
create or replace function public.mark_welcomed() returns void
language sql security definer set search_path = public as $$
  update public.profiles set welcomed_at = now() where id = auth.uid() and welcomed_at is null;
$$;
revoke all on function public.membership(), public.has_gallery_access(), public.mark_welcomed() from public, anon;
grant execute on function public.membership(), public.has_gallery_access(), public.mark_welcomed() to authenticated;

-- called by the Buy Me a Coffee webhook (service role only). Access never shrinks below what's already paid or granted.
create or replace function public.record_membership(member_email text, event text, level_name text,
                                                    period_end timestamptz, body jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.subscriptions as s (email, source, status, level, paid_through, last_event, updated_at)
  values (lower(btrim(member_email)), 'buymeacoffee', event, level_name, period_end, body, now())
  on conflict (email) do update set
    source = 'buymeacoffee', status = excluded.status, level = coalesce(excluded.level, s.level),
    paid_through = greatest(s.paid_through, excluded.paid_through), last_event = excluded.last_event, updated_at = now();
$$;
revoke all on function public.record_membership(text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.record_membership(text, text, text, timestamptz, jsonb) to service_role;

-- admins: give someone gallery access (a gift, your photographer, a refund-free fix), counted from today or from
-- the end of what they already have
create or replace function public.admin_grant_access(member_email text, months int, why text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(member_email)); until_ts timestamptz;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if months is null or months not between 1 and 120 then raise exception 'Choose 1 to 120 months.'; end if;
  if position('@' in e) < 2 then raise exception 'That doesn''t look like an email address.'; end if;
  insert into public.subscriptions as s (email, source, status, paid_through, note, updated_at)
  values (e, 'manual', 'comp', now() + make_interval(months => months), why, now())
  on conflict (email) do update set
    paid_through = greatest(coalesce(s.paid_through, now()), now()) + make_interval(months => months),
    status = case when s.source = 'manual' then 'comp' else s.status end,
    note = coalesce(why, s.note), updated_at = now()
  returning paid_through into until_ts;
  return until_ts;
end $$;
create or replace function public.admin_subscriptions()
returns table (email text, source text, status text, level text, paid_through timestamptz, updated_at timestamptz,
               note text, member text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.email, s.source, s.status, s.level, s.paid_through, s.updated_at, s.note, p.display_name
    from public.subscriptions s
    left join auth.users u on lower(u.email) = s.email
    left join public.profiles p on p.id = u.id
    order by s.updated_at desc limit 300;
end $$;
revoke all on function public.admin_grant_access(text, int, text), public.admin_subscriptions() from public, anon;
grant execute on function public.admin_grant_access(text, int, text), public.admin_subscriptions() to authenticated;

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

-- ---------------------------------------------------------------- moderation status (photos and reviews)
do $$ begin
  create type public.moderation_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create or replace function public.requeue_on_edit() returns trigger      -- edits by members go back for review
language plpgsql as $$
begin
  if not public.is_admin() then
    new.status := 'pending'; new.reviewed_at := null;
    if tg_table_name = 'reviews' then new.updated_at := now(); end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- photos
create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  basilica_id  text not null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[a-z0-9-]+/[a-z0-9-]+\.jpg$'),
  thumb_path   text generated always as (regexp_replace(storage_path, '\.jpg$', '.t.jpg')) stored,  -- 480 px copy for grids
  caption      text check (caption is null or char_length(caption) <= 300),
  width        int,
  height       int,
  status       public.moderation_status not null default 'pending',
  like_count   int not null default 0,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  foreign key (user_id, basilica_id) references public.visits(user_id, basilica_id) on delete cascade,
  -- the file must sit in the uploader's own folder for this basilica
  check (storage_path like (user_id::text || '/' || basilica_id || '/%'))
);
alter table public.photos add column if not exists like_count int not null default 0;
create index if not exists photos_status_created on public.photos (status, created_at desc);
create index if not exists photos_popular on public.photos (basilica_id, like_count desc, created_at desc) where status = 'approved';
create index if not exists photos_latest on public.photos (basilica_id, created_at desc) where status = 'approved';
alter table public.photos enable row level security;

drop policy if exists "own photos" on public.photos;
create policy "own photos" on public.photos for select to authenticated using (user_id = auth.uid());
drop policy if exists "gallery photos" on public.photos;
create policy "gallery photos" on public.photos for select to authenticated
  using (status = 'approved' and (select public.has_gallery_access()));
drop policy if exists "admins see all photos" on public.photos;
create policy "admins see all photos" on public.photos for select to authenticated using (public.is_admin());
drop policy if exists "add own photo" on public.photos;
create policy "add own photo" on public.photos for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_at is null and like_count = 0);
drop policy if exists "edit own caption" on public.photos;
create policy "edit own caption" on public.photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own photo" on public.photos;
create policy "delete own photo" on public.photos for delete to authenticated using (user_id = auth.uid());
drop policy if exists "admins delete photos" on public.photos;
create policy "admins delete photos" on public.photos for delete to authenticated using (public.is_admin());

revoke all on public.photos from anon, authenticated;
grant select, delete on public.photos to authenticated;
grant insert (basilica_id, storage_path, caption, width, height) on public.photos to authenticated;
grant update (caption) on public.photos to authenticated;          -- status and likes change only via functions

drop trigger if exists photos_requeue on public.photos;
create trigger photos_requeue before update of caption on public.photos
  for each row when (new.caption is distinct from old.caption) execute function public.requeue_on_edit();

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

-- ---------------------------------------------------------------- reviews
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  basilica_id text not null,
  body        text not null check (char_length(btrim(body)) between 20 and 2000),
  status      public.moderation_status not null default 'pending',
  like_count  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, basilica_id),                                       -- one review per member per basilica
  foreign key (user_id, basilica_id) references public.visits(user_id, basilica_id) on delete cascade
);
create index if not exists reviews_popular on public.reviews (basilica_id, like_count desc, created_at desc) where status = 'approved';
create index if not exists reviews_latest on public.reviews (basilica_id, created_at desc) where status = 'approved';
create index if not exists reviews_queue on public.reviews (status, created_at);
alter table public.reviews enable row level security;

drop policy if exists "own reviews" on public.reviews;
create policy "own reviews" on public.reviews for select to authenticated using (user_id = auth.uid());
drop policy if exists "gallery reviews" on public.reviews;
create policy "gallery reviews" on public.reviews for select to authenticated
  using (status = 'approved' and (select public.has_gallery_access()));
drop policy if exists "admins see all reviews" on public.reviews;
create policy "admins see all reviews" on public.reviews for select to authenticated using (public.is_admin());
-- a review needs a logged visit (the foreign key) and at least one of the member's own photos from it
drop policy if exists "review after a visit with photos" on public.reviews;
create policy "review after a visit with photos" on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_at is null and like_count = 0
              and exists (select 1 from public.photos p where p.user_id = auth.uid() and p.basilica_id = reviews.basilica_id));
drop policy if exists "edit own review" on public.reviews;
create policy "edit own review" on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own review" on public.reviews;
create policy "delete own review" on public.reviews for delete to authenticated using (user_id = auth.uid());
drop policy if exists "admins delete reviews" on public.reviews;
create policy "admins delete reviews" on public.reviews for delete to authenticated using (public.is_admin());

revoke all on public.reviews from anon, authenticated;
grant select, delete on public.reviews to authenticated;
grant insert (basilica_id, body) on public.reviews to authenticated;
grant update (body) on public.reviews to authenticated;

drop trigger if exists reviews_requeue on public.reviews;
create trigger reviews_requeue before update of body on public.reviews
  for each row when (new.body is distinct from old.body) execute function public.requeue_on_edit();

-- ---------------------------------------------------------------- likes
-- (members/core.js names the foreign keys photos_user_id_fkey and reviews_user_id_fkey when it fetches display names,
--  because these tables give photos and reviews a second route to profiles)
create table if not exists public.photo_likes (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create table if not exists public.review_likes (
  review_id  uuid not null references public.reviews(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index if not exists photo_likes_user on public.photo_likes (user_id);
create index if not exists review_likes_user on public.review_likes (user_id);
alter table public.photo_likes enable row level security;
alter table public.review_likes enable row level security;

drop policy if exists "own photo likes" on public.photo_likes;
create policy "own photo likes" on public.photo_likes for select to authenticated using (user_id = auth.uid());
drop policy if exists "like a gallery photo" on public.photo_likes;
create policy "like a gallery photo" on public.photo_likes for insert to authenticated
  with check (user_id = auth.uid() and (select public.has_gallery_access())
              and exists (select 1 from public.photos p where p.id = photo_id and p.status = 'approved' and p.user_id <> auth.uid()));
drop policy if exists "unlike a photo" on public.photo_likes;
create policy "unlike a photo" on public.photo_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "own review likes" on public.review_likes;
create policy "own review likes" on public.review_likes for select to authenticated using (user_id = auth.uid());
drop policy if exists "like a gallery review" on public.review_likes;
create policy "like a gallery review" on public.review_likes for insert to authenticated
  with check (user_id = auth.uid() and (select public.has_gallery_access())
              and exists (select 1 from public.reviews r where r.id = review_id and r.status = 'approved' and r.user_id <> auth.uid()));
drop policy if exists "unlike a review" on public.review_likes;
create policy "unlike a review" on public.review_likes for delete to authenticated using (user_id = auth.uid());

revoke all on public.photo_likes, public.review_likes from anon, authenticated;
grant select, delete on public.photo_likes, public.review_likes to authenticated;
grant insert (photo_id) on public.photo_likes to authenticated;
grant insert (review_id) on public.review_likes to authenticated;

-- keep like_count in step with the likes tables (members can't write like_count themselves)
create or replace function public.count_likes() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'photo_likes' then
    update public.photos set like_count = greatest(0, like_count + d)
      where id = case when tg_op = 'INSERT' then new.photo_id else old.photo_id end;
  else
    update public.reviews set like_count = greatest(0, like_count + d)
      where id = case when tg_op = 'INSERT' then new.review_id else old.review_id end;
  end if;
  return null;
end $$;
drop trigger if exists photo_likes_count on public.photo_likes;
create trigger photo_likes_count after insert or delete on public.photo_likes
  for each row execute function public.count_likes();
drop trigger if exists review_likes_count on public.review_likes;
create trigger review_likes_count after insert or delete on public.review_likes
  for each row execute function public.count_likes();

-- ---------------------------------------------------------------- moderation (admins)
create or replace function public.moderate(kind text, item_id uuid, decision public.moderation_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if decision = 'pending' then raise exception 'decision must be approved or rejected'; end if;
  if kind = 'photo' then
    update public.photos set status = decision, reviewed_at = now() where id = item_id;
  elsif kind = 'review' then
    update public.reviews set status = decision, reviewed_at = now() where id = item_id;
  else
    raise exception 'kind must be photo or review';
  end if;
end $$;
revoke all on function public.moderate(text, uuid, public.moderation_status) from public, anon;
grant execute on function public.moderate(text, uuid, public.moderation_status) to authenticated;

-- how many approved photos and reviews each basilica has: shown to every signed-in member,
-- so members without gallery access can see what the gallery holds
create or replace function public.gallery_counts() returns table (basilica_id text, photos bigint, reviews bigint)
language sql stable security definer set search_path = public as $$
  select b.id,
         (select count(*) from public.photos p where p.basilica_id = b.id and p.status = 'approved'),
         (select count(*) from public.reviews r where r.basilica_id = b.id and r.status = 'approved')
  from public.basilicas b;
$$;
revoke all on function public.gallery_counts() from public, anon;
grant execute on function public.gallery_counts() to authenticated;

-- signed-out visitors get nothing from the member tables (RLS would return no rows anyway; this makes it explicit)
revoke all on public.profiles, public.visits, public.photos, public.reviews, public.photo_likes, public.review_likes,
  public.admins, public.subscriptions from anon;

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
  using (bucket_id = 'member-photos' and (select public.has_gallery_access())
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
