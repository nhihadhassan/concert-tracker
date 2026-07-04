create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0)
);

create table public.rating_rule_versions (
  id uuid primary key default extensions.gen_random_uuid(),
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
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  constraint rating_rule_weight_total check (
    abs((enjoyment_weight + stage_weight + setlist_weight + seat_weight) - 1.0) < 0.00001
  )
);

create table public.concerts (
  id uuid primary key default extensions.gen_random_uuid(),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0)
);

create table public.concert_attendees (
  concert_id uuid not null references public.concerts(id) on delete cascade,
  user_id uuid not null references public.app_members(user_id) on delete cascade,
  attendance_status text not null default 'Attended' check (attendance_status in ('Planned', 'Attended', 'Did Not Attend')),
  legacy_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  primary key (concert_id, user_id)
);

create table public.concert_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  unique (concert_id, reviewer_user_id),
  constraint concert_review_override_reason check (
    rating_override is null or length(trim(coalesce(rating_override_reason, ''))) > 0
  )
);

create index concerts_date_idx on public.concerts (concert_date desc) where deleted_at is null;
create index concerts_status_idx on public.concerts (status) where deleted_at is null;
create index concert_attendees_user_idx on public.concert_attendees (user_id) where deleted_at is null;
create index concert_reviews_reviewer_idx on public.concert_reviews (reviewer_user_id) where deleted_at is null;

create or replace function public.is_app_member(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_members
    where user_id = check_user_id
      and is_active = true
      and deleted_at is null
  );
$$;

revoke all on function public.is_app_member(uuid) from public;
grant execute on function public.is_app_member(uuid) to authenticated;

create or replace function public.set_row_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, new.created_by, auth.uid());
    new.row_version := coalesce(new.row_version, 1);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
    new.row_version := old.row_version + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.set_row_metadata() from public;

create or replace function public.protect_attendee_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
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
security invoker
set search_path = ''
as $$
begin
  if new.concert_id <> old.concert_id or new.reviewer_user_id <> old.reviewer_user_id then
    raise exception 'Review identity columns are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_attendee_identity() from public;
revoke all on function public.protect_review_identity() from public;

create trigger app_members_metadata before insert or update on public.app_members
for each row execute function public.set_row_metadata();
create trigger rating_rule_versions_metadata before insert or update on public.rating_rule_versions
for each row execute function public.set_row_metadata();
create trigger concerts_metadata before insert or update on public.concerts
for each row execute function public.set_row_metadata();
create trigger concert_attendees_metadata before insert or update on public.concert_attendees
for each row execute function public.set_row_metadata();
create trigger concert_reviews_metadata before insert or update on public.concert_reviews
for each row execute function public.set_row_metadata();
create trigger concert_attendees_identity before update on public.concert_attendees
for each row execute function public.protect_attendee_identity();
create trigger concert_reviews_identity before update on public.concert_reviews
for each row execute function public.protect_review_identity();

alter table public.app_members enable row level security;
alter table public.rating_rule_versions enable row level security;
alter table public.concerts enable row level security;
alter table public.concert_attendees enable row level security;
alter table public.concert_reviews enable row level security;

revoke all on public.app_members from anon, authenticated;
revoke all on public.rating_rule_versions from anon, authenticated;
revoke all on public.concerts from anon, authenticated;
revoke all on public.concert_attendees from anon, authenticated;
revoke all on public.concert_reviews from anon, authenticated;

grant select on public.app_members to authenticated;
grant select on public.rating_rule_versions to authenticated;
grant select, insert, update on public.concerts to authenticated;
grant select, insert, update on public.concert_attendees to authenticated;
grant select, insert, update on public.concert_reviews to authenticated;

create policy app_members_select_shared
on public.app_members for select
to authenticated
using ((select public.is_app_member()) and deleted_at is null);

create policy rating_rule_versions_select_shared
on public.rating_rule_versions for select
to authenticated
using ((select public.is_app_member()) and deleted_at is null);

create policy concerts_select_shared
on public.concerts for select
to authenticated
using ((select public.is_app_member()) and deleted_at is null);

create policy concerts_insert_shared
on public.concerts for insert
to authenticated
with check ((select public.is_app_member()) and created_by = (select auth.uid()));

create policy concerts_update_shared
on public.concerts for update
to authenticated
using ((select public.is_app_member()) and deleted_at is null)
with check ((select public.is_app_member()));

create policy concert_attendees_select_shared
on public.concert_attendees for select
to authenticated
using ((select public.is_app_member()) and deleted_at is null);

create policy concert_attendees_insert_shared
on public.concert_attendees for insert
to authenticated
with check ((select public.is_app_member()) and created_by = (select auth.uid()));

create policy concert_attendees_update_shared
on public.concert_attendees for update
to authenticated
using ((select public.is_app_member()) and deleted_at is null)
with check ((select public.is_app_member()));

create policy concert_reviews_select_shared
on public.concert_reviews for select
to authenticated
using ((select public.is_app_member()) and deleted_at is null);

create policy concert_reviews_insert_shared
on public.concert_reviews for insert
to authenticated
with check (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and created_by = (select auth.uid())
);

create policy concert_reviews_update_own
on public.concert_reviews for update
to authenticated
using (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
  and deleted_at is null
)
with check (
  (select public.is_app_member())
  and reviewer_user_id = (select auth.uid())
);

insert into public.rating_rule_versions (
  version,
  enjoyment_weight,
  stage_weight,
  setlist_weight,
  seat_weight,
  rounds_to,
  maximum_rating,
  renormalize_missing
) values (
  1,
  0.5000000,
  0.1666667,
  0.1666667,
  0.1666666,
  1,
  10.0,
  true
);
