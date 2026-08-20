-- Concert Tracker schema, ported from the shared Supabase project
-- (supabase/migrations/20260630180000_stage2_shared_schema.sql and later CT-owned
-- migrations) for a standalone Neon Postgres database.
--
-- This is a hand port, not a copy: see docs/DATA_PROVIDERS.md for exactly what was
-- kept, dropped, and reworked, and why. In short:
--   - Kept verbatim: every table, column, CHECK constraint, index, row_version
--     optimistic-concurrency columns, identity-protection triggers, and the
--     restore_encore_backup function body.
--   - Dropped: auth.users foreign keys, Row Level Security + policies, grants to
--     anon/authenticated/service_role, supabase_realtime publication statements.
--     Supabase's own service-role key already bypassed RLS in production (see
--     ARCHITECTURE.md), so none of this changes observable behavior.
--   - Reworked: set_row_metadata() no longer calls auth.uid() (Neon has no `auth`
--     schema). created_by/updated_by are instead filled by the application layer
--     (backend/neon_rest.py) with the single configured PUBLIC_USER_ID -- verified
--     against production that this is exactly what auth.uid() was already
--     resolving to there, so this is a behavior-preserving simplification, not a
--     change.
--
-- Idempotent: safe to re-run against an empty database. Apply with the DIRECT
-- (non-pooled) connection string -- see the neon-postgres skill's guidance on
-- schema migrations needing a direct connection, not the pooled one.

create extension if not exists citext;

-- gen_random_uuid() is a Postgres core builtin on Neon's default PG16/17, so
-- pgcrypto (needed only for it on older Postgres) is not required here.

create table if not exists public.app_members (
  user_id uuid primary key,
  email citext not null unique,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0)
);

create table if not exists public.rating_rule_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  enjoyment_weight numeric(8, 7) not null check (enjoyment_weight > 0),
  stage_weight numeric(8, 7) not null check (stage_weight > 0),
  setlist_weight numeric(8, 7) not null check (setlist_weight > 0),
  seat_weight numeric(8, 7) not null check (seat_weight > 0),
  rounds_to integer not null default 1 check (rounds_to between 0 and 4),
  maximum_rating numeric(4, 2) not null default 10 check (maximum_rating > 0),
  renormalize_missing boolean not null default true,
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  constraint rating_rule_weight_total check (
    abs((enjoyment_weight + stage_weight + setlist_weight + seat_weight) - 1.0) < 0.00001
  )
);

create table if not exists public.concerts (
  id uuid primary key default gen_random_uuid(),
  artist text not null check (length(trim(artist)) between 1 and 200),
  tour_name text,
  concert_date date not null,
  venue text not null check (length(trim(venue)) between 1 and 300),
  price numeric(10, 2) check (price is null or price >= 0),
  genre text,
  projected_rating numeric(5, 2) check (projected_rating is null or projected_rating >= 0),
  seat text,
  status text not null default 'Want to Go' check (status in ('Want to Go', 'Attended', 'Cancelled')),
  concert_type text not null default 'Concert',
  spotify_url text,
  image_url text,
  notes text,
  legacy_source_id text,
  companions text,
  legacy_rank integer check (legacy_rank is null or legacy_rank > 0),
  last_mutation_id uuid,
  setlist_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0)
);

create table if not exists public.concert_attendees (
  concert_id uuid not null references public.concerts(id) on delete cascade,
  user_id uuid not null references public.app_members(user_id) on delete cascade,
  attendance_status text not null default 'Attended' check (attendance_status in ('Planned', 'Attended', 'Did Not Attend')),
  legacy_source text,
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  primary key (concert_id, user_id)
);

create table if not exists public.concert_reviews (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_members(user_id) on delete cascade,
  rating_rule_version_id uuid references public.rating_rule_versions(id),
  enjoyment_score numeric(5, 2) check (enjoyment_score is null or enjoyment_score >= 0),
  stage_score numeric(5, 2) check (stage_score is null or stage_score >= 0),
  setlist_score numeric(5, 2) check (setlist_score is null or setlist_score >= 0),
  seat_score numeric(5, 2) check (seat_score is null or seat_score >= 0),
  rating_override numeric(4, 2) check (rating_override is null or rating_override between 0 and 10),
  rating_override_reason text,
  review_notes text,
  legacy_source text,
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (concert_id, reviewer_user_id),
  constraint concert_review_override_reason check (
    rating_override is null or length(trim(coalesce(rating_override_reason, ''))) > 0
  )
);

create index if not exists concerts_date_idx on public.concerts (concert_date desc) where deleted_at is null;
create index if not exists concerts_status_idx on public.concerts (status) where deleted_at is null;
create index if not exists concert_attendees_user_idx on public.concert_attendees (user_id) where deleted_at is null;
create index if not exists concert_reviews_reviewer_idx on public.concert_reviews (reviewer_user_id) where deleted_at is null;
create unique index if not exists concerts_legacy_source_id_uidx on public.concerts (legacy_source_id) where legacy_source_id is not null;
create unique index if not exists concerts_legacy_rank_uidx on public.concerts (legacy_rank) where legacy_rank is not null;

create table if not exists public.api_idempotency_keys (
  user_id uuid not null references public.app_members(user_id) on delete cascade,
  idempotency_key uuid not null,
  request_method text not null,
  request_path text not null,
  request_hash text not null,
  response_status integer not null check (response_status between 200 and 299),
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index if not exists api_idempotency_keys_created_idx on public.api_idempotency_keys (created_at);

-- Row metadata trigger: keeps updated_at/row_version bookkeeping (load-bearing
-- for optimistic concurrency) but no longer resolves an actor via auth.uid() --
-- the application layer supplies created_by/updated_by on every write, matching
-- what auth.uid() was already resolving to in production (see file header).
create or replace function public.set_row_metadata()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at, now());
    new.updated_by := coalesce(new.updated_by, new.created_by);
    new.row_version := coalesce(new.row_version, 1);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(new.updated_by, old.updated_by);
    new.row_version := old.row_version + 1;
  end if;
  return new;
end;
$$;

create or replace function public.protect_attendee_identity()
returns trigger
language plpgsql
as $$
begin
  if new.concert_id <> old.concert_id or new.user_id <> old.user_id then
    raise exception 'Attendee identity columns are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.protect_review_identity()
returns trigger
language plpgsql
as $$
begin
  if new.concert_id <> old.concert_id or new.reviewer_user_id <> old.reviewer_user_id then
    raise exception 'Review identity columns are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists app_members_metadata on public.app_members;
create trigger app_members_metadata before insert or update on public.app_members
for each row execute function public.set_row_metadata();
drop trigger if exists rating_rule_versions_metadata on public.rating_rule_versions;
create trigger rating_rule_versions_metadata before insert or update on public.rating_rule_versions
for each row execute function public.set_row_metadata();
drop trigger if exists concerts_metadata on public.concerts;
create trigger concerts_metadata before insert or update on public.concerts
for each row execute function public.set_row_metadata();
drop trigger if exists concert_attendees_metadata on public.concert_attendees;
create trigger concert_attendees_metadata before insert or update on public.concert_attendees
for each row execute function public.set_row_metadata();
drop trigger if exists concert_reviews_metadata on public.concert_reviews;
create trigger concert_reviews_metadata before insert or update on public.concert_reviews
for each row execute function public.set_row_metadata();
drop trigger if exists concert_attendees_identity on public.concert_attendees;
create trigger concert_attendees_identity before update on public.concert_attendees
for each row execute function public.protect_attendee_identity();
drop trigger if exists concert_reviews_identity on public.concert_reviews;
create trigger concert_reviews_identity before update on public.concert_reviews
for each row execute function public.protect_review_identity();

-- No seed data here, deliberately: rating_rule_versions.id must match the
-- source system's id exactly, since concert_reviews.rating_rule_version_id
-- references it by id, not by version. scripts/neon_cutover.py populates
-- this table (and everything else) with the real migrated rows, preserving
-- their original ids. Re-running this schema file is safe and idempotent
-- (every statement is `if not exists`/`create or replace`), but leaves this
-- table for the cutover script to fill.

-- Album journal (supabase/migrations/20260727113000_album_journal.sql)

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  spotify_album_id text not null unique,
  title text not null check (length(trim(title)) between 1 and 300),
  artist text not null check (length(trim(artist)) between 1 and 300),
  album_type text not null default 'album',
  release_date text,
  release_date_precision text check (
    release_date_precision is null
    or release_date_precision in ('year', 'month', 'day')
  ),
  image_url text,
  spotify_url text,
  label text,
  genres text[] not null default '{}',
  total_tracks integer not null default 0 check (total_tracks >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0)
);

create table if not exists public.album_tracks (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  spotify_track_id text not null,
  title text not null check (length(trim(title)) between 1 and 500),
  disc_number integer not null default 1 check (disc_number > 0),
  track_number integer not null check (track_number > 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  explicit boolean not null default false,
  spotify_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (album_id, spotify_track_id),
  unique (album_id, disc_number, track_number)
);

create table if not exists public.album_reviews (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_members(user_id) on delete cascade,
  overall_score numeric(4, 2) check (overall_score is null or overall_score between 0 and 10),
  review_markdown text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (album_id, reviewer_user_id),
  constraint album_review_publish_content check (
    status = 'draft'
    or length(trim(coalesce(review_markdown, ''))) > 0
  )
);

create table if not exists public.album_track_reviews (
  id uuid primary key default gen_random_uuid(),
  album_review_id uuid not null references public.album_reviews(id) on delete cascade,
  album_track_id uuid not null references public.album_tracks(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_members(user_id) on delete cascade,
  personal_rank integer check (personal_rank is null or personal_rank > 0),
  score numeric(4, 2) check (score is null or score between 0 and 10),
  notes text check (notes is null or length(notes) <= 1000),
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (album_review_id, album_track_id)
);

create unique index if not exists album_track_reviews_rank_unique
on public.album_track_reviews (album_review_id, personal_rank)
where personal_rank is not null and deleted_at is null;
create index if not exists albums_artist_title_idx
on public.albums (artist, title) where deleted_at is null;
create index if not exists album_tracks_order_idx
on public.album_tracks (album_id, disc_number, track_number) where deleted_at is null;
create index if not exists album_reviews_reviewer_idx
on public.album_reviews (reviewer_user_id) where deleted_at is null;

create or replace function public.protect_album_review_identity()
returns trigger
language plpgsql
as $$
begin
  if new.album_id <> old.album_id or new.reviewer_user_id <> old.reviewer_user_id then
    raise exception 'Album review identity columns are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.protect_album_track_review_identity()
returns trigger
language plpgsql
as $$
begin
  if new.album_review_id <> old.album_review_id
    or new.album_track_id <> old.album_track_id
    or new.reviewer_user_id <> old.reviewer_user_id then
    raise exception 'Album track review identity columns are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists albums_metadata on public.albums;
create trigger albums_metadata before insert or update on public.albums
for each row execute function public.set_row_metadata();
drop trigger if exists album_tracks_metadata on public.album_tracks;
create trigger album_tracks_metadata before insert or update on public.album_tracks
for each row execute function public.set_row_metadata();
drop trigger if exists album_reviews_metadata on public.album_reviews;
create trigger album_reviews_metadata before insert or update on public.album_reviews
for each row execute function public.set_row_metadata();
drop trigger if exists album_track_reviews_metadata on public.album_track_reviews;
create trigger album_track_reviews_metadata before insert or update on public.album_track_reviews
for each row execute function public.set_row_metadata();
drop trigger if exists album_reviews_identity on public.album_reviews;
create trigger album_reviews_identity before update on public.album_reviews
for each row execute function public.protect_album_review_identity();
drop trigger if exists album_track_reviews_identity on public.album_track_reviews;
create trigger album_track_reviews_identity before update on public.album_track_reviews
for each row execute function public.protect_album_track_review_identity();

-- Spotify account link (supabase/migrations/20260708135214_create_spotify_accounts.sql)

create table if not exists public.spotify_accounts (
  user_id uuid primary key,
  refresh_token text not null,
  spotify_user_id text,
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- restore_encore_backup (supabase/migrations/20260818120000_encore_archive_restore_and_setlists.sql),
-- ported verbatim except gen_random_uuid() no longer needs the extensions.
-- schema qualifier, and the service_role grant is dropped (no such role on
-- Neon; the connecting owner role already has execute on functions it owns).

create or replace function public.restore_encore_backup(
  payload jsonb,
  actor_id uuid,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  item jsonb;
  target_id uuid;
  record_id uuid;
  attendee jsonb;
  review jsonb;
  restored_count integer := 0;
begin
  for item in select value from jsonb_array_elements(coalesce(payload->'records', '[]'::jsonb))
  loop
    target_id := nullif(item->>'target_id', '')::uuid;
    record_id := coalesce(target_id, (item->'concert'->>'id')::uuid);

    if target_id is null then
      insert into public.concerts (
        id, artist, tour_name, concert_date, venue, price, genre,
        projected_rating, seat, status, concert_type, setlist_url, spotify_url,
        image_url, notes, companions, created_by, last_mutation_id
      ) values (
        record_id,
        item->'concert'->>'artist',
        nullif(item->'concert'->>'tour', ''),
        (item->'concert'->>'date')::date,
        item->'concert'->>'venue',
        nullif(item->'concert'->>'price', '')::numeric,
        nullif(item->'concert'->>'genre', ''),
        nullif(item->'concert'->>'projected', '')::numeric,
        nullif(item->'concert'->>'seat', ''),
        item->'concert'->>'status',
        coalesce(nullif(item->'concert'->>'type', ''), 'Concert'),
        nullif(item->'concert'->>'setlist_url', ''),
        nullif(item->'concert'->>'spotify_url', ''),
        nullif(item->'concert'->>'image', ''),
        nullif(item->'concert'->>'notes', ''),
        nullif(item->'concert'->>'companions', ''),
        actor_id,
        mutation_id
      );
    else
      update public.concerts
      set artist = item->'concert'->>'artist',
          tour_name = nullif(item->'concert'->>'tour', ''),
          concert_date = (item->'concert'->>'date')::date,
          venue = item->'concert'->>'venue',
          price = nullif(item->'concert'->>'price', '')::numeric,
          genre = nullif(item->'concert'->>'genre', ''),
          projected_rating = nullif(item->'concert'->>'projected', '')::numeric,
          seat = nullif(item->'concert'->>'seat', ''),
          status = item->'concert'->>'status',
          concert_type = coalesce(nullif(item->'concert'->>'type', ''), 'Concert'),
          setlist_url = nullif(item->'concert'->>'setlist_url', ''),
          spotify_url = nullif(item->'concert'->>'spotify_url', ''),
          image_url = nullif(item->'concert'->>'image', ''),
          notes = nullif(item->'concert'->>'notes', ''),
          companions = nullif(item->'concert'->>'companions', ''),
          last_mutation_id = mutation_id
      where id = target_id and deleted_at is null;
      if not found then
        raise exception 'Restore target % no longer exists', target_id;
      end if;
    end if;

    for attendee in select value from jsonb_array_elements(coalesce(item->'attendees', '[]'::jsonb))
    loop
      insert into public.concert_attendees (
        concert_id, user_id, attendance_status, created_by, last_mutation_id, deleted_at
      ) values (
        record_id,
        (attendee->>'user_id')::uuid,
        attendee->>'attendance_status',
        actor_id,
        mutation_id,
        null
      ) on conflict (concert_id, user_id) do update
      set attendance_status = excluded.attendance_status,
          deleted_at = null,
          last_mutation_id = mutation_id;
    end loop;

    for review in select value from jsonb_array_elements(coalesce(item->'reviews', '[]'::jsonb))
    loop
      insert into public.concert_reviews (
        id, concert_id, reviewer_user_id, enjoyment_score, stage_score,
        setlist_score, seat_score, rating_override, rating_override_reason,
        review_notes, rating_rule_version_id, created_by, last_mutation_id, deleted_at
      ) values (
        coalesce(nullif(review->>'id', '')::uuid, gen_random_uuid()),
        record_id,
        (review->>'reviewer_user_id')::uuid,
        nullif(review->>'enjoyment_score', '')::numeric,
        nullif(review->>'stage_score', '')::numeric,
        nullif(review->>'setlist_score', '')::numeric,
        nullif(review->>'seat_score', '')::numeric,
        nullif(review->>'override_rating', '')::numeric,
        nullif(review->>'override_reason', ''),
        nullif(review->>'notes', ''),
        (select id from public.rating_rule_versions where retired_at is null order by version desc limit 1),
        actor_id,
        mutation_id,
        null
      ) on conflict (concert_id, reviewer_user_id) do update
      set enjoyment_score = excluded.enjoyment_score,
          stage_score = excluded.stage_score,
          setlist_score = excluded.setlist_score,
          seat_score = excluded.seat_score,
          rating_override = excluded.rating_override,
          rating_override_reason = excluded.rating_override_reason,
          review_notes = excluded.review_notes,
          rating_rule_version_id = excluded.rating_rule_version_id,
          deleted_at = null,
          last_mutation_id = mutation_id;
    end loop;
    restored_count := restored_count + 1;
  end loop;
  return jsonb_build_object('restored', restored_count);
end;
$$;
