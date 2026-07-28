begin;

create table public.albums (
  id uuid primary key default extensions.gen_random_uuid(),
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
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0)
);

create table public.album_tracks (
  id uuid primary key default extensions.gen_random_uuid(),
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
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (album_id, spotify_track_id),
  unique (album_id, disc_number, track_number)
);

create table public.album_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_members(user_id) on delete cascade,
  overall_score numeric(4, 2) check (overall_score is null or overall_score between 0 and 10),
  review_markdown text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (album_id, reviewer_user_id),
  constraint album_review_publish_content check (
    status = 'draft'
    or length(trim(coalesce(review_markdown, ''))) > 0
  )
);

create table public.album_track_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  album_review_id uuid not null references public.album_reviews(id) on delete cascade,
  album_track_id uuid not null references public.album_tracks(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_members(user_id) on delete cascade,
  personal_rank integer check (personal_rank is null or personal_rank > 0),
  score numeric(4, 2) check (score is null or score between 0 and 10),
  notes text check (notes is null or length(notes) <= 1000),
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (album_review_id, album_track_id)
);

create unique index album_track_reviews_rank_unique
on public.album_track_reviews (album_review_id, personal_rank)
where personal_rank is not null and deleted_at is null;
create index albums_artist_title_idx
on public.albums (artist, title) where deleted_at is null;
create index album_tracks_order_idx
on public.album_tracks (album_id, disc_number, track_number) where deleted_at is null;
create index album_reviews_reviewer_idx
on public.album_reviews (reviewer_user_id) where deleted_at is null;

create or replace function public.protect_album_review_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
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
security invoker
set search_path = ''
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

revoke all on function public.protect_album_review_identity() from public;
revoke all on function public.protect_album_track_review_identity() from public;

create trigger albums_metadata before insert or update on public.albums
for each row execute function public.set_row_metadata();
create trigger album_tracks_metadata before insert or update on public.album_tracks
for each row execute function public.set_row_metadata();
create trigger album_reviews_metadata before insert or update on public.album_reviews
for each row execute function public.set_row_metadata();
create trigger album_track_reviews_metadata before insert or update on public.album_track_reviews
for each row execute function public.set_row_metadata();
create trigger album_reviews_identity before update on public.album_reviews
for each row execute function public.protect_album_review_identity();
create trigger album_track_reviews_identity before update on public.album_track_reviews
for each row execute function public.protect_album_track_review_identity();

alter table public.albums enable row level security;
alter table public.album_tracks enable row level security;
alter table public.album_reviews enable row level security;
alter table public.album_track_reviews enable row level security;

revoke all on public.albums from anon, authenticated;
revoke all on public.album_tracks from anon, authenticated;
revoke all on public.album_reviews from anon, authenticated;
revoke all on public.album_track_reviews from anon, authenticated;

grant select, insert, update on public.albums to authenticated;
grant select, insert, update on public.album_tracks to authenticated;
grant select, insert, update on public.album_reviews to authenticated;
grant select, insert, update on public.album_track_reviews to authenticated;

create policy albums_select_shared
on public.albums for select to authenticated
using ((select public.is_app_member()) and deleted_at is null);
create policy albums_select_deleted_shared
on public.albums for select to authenticated
using ((select public.is_app_member()) and deleted_at is not null);
create policy albums_insert_shared
on public.albums for insert to authenticated
with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy albums_update_shared
on public.albums for update to authenticated
using ((select public.is_app_member()) and deleted_at is null)
with check ((select public.is_app_member()));

create policy album_tracks_select_shared
on public.album_tracks for select to authenticated
using ((select public.is_app_member()) and deleted_at is null);
create policy album_tracks_select_deleted_shared
on public.album_tracks for select to authenticated
using ((select public.is_app_member()) and deleted_at is not null);
create policy album_tracks_insert_shared
on public.album_tracks for insert to authenticated
with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy album_tracks_update_shared
on public.album_tracks for update to authenticated
using ((select public.is_app_member()) and deleted_at is null)
with check ((select public.is_app_member()));

create policy album_reviews_select_shared
on public.album_reviews for select to authenticated
using (
  (select public.is_app_member())
  and deleted_at is null
  and (status = 'published' or reviewer_user_id = (select auth.uid()))
);
create policy album_reviews_select_deleted_shared
on public.album_reviews for select to authenticated
using (
  (select public.is_app_member())
  and deleted_at is not null
  and reviewer_user_id = (select auth.uid())
);
create policy album_reviews_insert_own
on public.album_reviews for insert to authenticated
with check (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and created_by = (select auth.uid())
);
create policy album_reviews_update_own
on public.album_reviews for update to authenticated
using (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and deleted_at is null
)
with check (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
);

create policy album_track_reviews_select_shared
on public.album_track_reviews for select to authenticated
using (
  (select public.is_app_member())
  and deleted_at is null
  and exists (
    select 1
    from public.album_reviews
    where public.album_reviews.id = album_review_id
      and public.album_reviews.deleted_at is null
      and (
        public.album_reviews.status = 'published'
        or public.album_reviews.reviewer_user_id = (select auth.uid())
      )
  )
);
create policy album_track_reviews_select_deleted_shared
on public.album_track_reviews for select to authenticated
using (
  (select public.is_app_member())
  and deleted_at is not null
  and reviewer_user_id = (select auth.uid())
);
create policy album_track_reviews_insert_own
on public.album_track_reviews for insert to authenticated
with check (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.album_reviews
    join public.album_tracks
      on public.album_tracks.album_id = public.album_reviews.album_id
    where public.album_reviews.id = album_review_id
      and public.album_reviews.reviewer_user_id = (select auth.uid())
      and public.album_reviews.deleted_at is null
      and public.album_tracks.id = album_track_id
      and public.album_tracks.deleted_at is null
  )
);
create policy album_track_reviews_update_own
on public.album_track_reviews for update to authenticated
using (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and deleted_at is null
)
with check (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and exists (
    select 1
    from public.album_reviews
    join public.album_tracks
      on public.album_tracks.album_id = public.album_reviews.album_id
    where public.album_reviews.id = album_review_id
      and public.album_reviews.reviewer_user_id = (select auth.uid())
      and public.album_reviews.deleted_at is null
      and public.album_tracks.id = album_track_id
      and public.album_tracks.deleted_at is null
  )
);

alter publication supabase_realtime add table public.albums;
alter publication supabase_realtime add table public.album_tracks;
alter publication supabase_realtime add table public.album_reviews;
alter publication supabase_realtime add table public.album_track_reviews;

commit;
