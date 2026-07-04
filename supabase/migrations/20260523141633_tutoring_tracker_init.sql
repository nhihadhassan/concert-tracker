
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type service_type as enum ('private', 'semi_private', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('scheduled', 'completed', 'missed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('paid', 'unpaid', 'waived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role as enum ('admin', 'parent');
exception when duplicate_object then null; end $$;

-- Tables
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  notes text,
  portal_enabled boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'parent',
  client_id uuid references clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  client_id uuid not null references clients(id),
  date date not null,
  start_time time,
  duration_minutes int,
  service_type service_type not null default 'private',
  status session_status not null default 'completed',
  fee numeric(10,2) not null default 0,
  payment_status payment_status not null default 'unpaid',
  payment_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_client_date_idx on sessions (client_id, date desc);
create index if not exists sessions_student_date_idx on sessions (student_id, date desc);
create index if not exists sessions_unpaid_idx on sessions (payment_status) where payment_status = 'unpaid';
create index if not exists sessions_date_idx on sessions (date);

create table if not exists recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes int,
  fee numeric(10,2) not null,
  service_type service_type not null default 'private',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1,
  default_fee_private numeric(10,2) not null default 25,
  default_fee_semi_private numeric(10,2) not null default 25,
  default_fee_other numeric(10,2) not null default 0,
  constraint settings_singleton check (id = 1)
);
insert into settings (id) values (1) on conflict do nothing;

-- updated_at trigger
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists sessions_set_updated_at on sessions;
create trigger sessions_set_updated_at
  before update on sessions
  for each row execute function set_updated_at();

-- Auto-create profile on user signup
create or replace function handle_new_user() returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'parent')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Admin helper (in public schema; auth.* is reserved)
create or replace function is_admin() returns boolean
  security definer
  set search_path = public
  language sql stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function is_admin() to anon, authenticated;

-- Convenience view
create or replace view client_balances as
select
  c.id,
  c.name,
  coalesce(sum(s.fee) filter (where s.payment_status = 'unpaid'), 0)::numeric(12,2) as balance_due,
  count(*) filter (where s.payment_status = 'unpaid') as unpaid_sessions,
  count(*) filter (where s.status = 'completed') as completed_sessions
from clients c
left join sessions s on s.client_id = c.id and s.status = 'completed'
group by c.id, c.name;

-- RLS
alter table clients             enable row level security;
alter table students            enable row level security;
alter table sessions            enable row level security;
alter table recurring_schedules enable row level security;
alter table profiles            enable row level security;
alter table settings            enable row level security;

drop policy if exists admin_all on clients;
create policy admin_all on clients for all using (is_admin()) with check (is_admin());

drop policy if exists admin_all on students;
create policy admin_all on students for all using (is_admin()) with check (is_admin());

drop policy if exists admin_all on sessions;
create policy admin_all on sessions for all using (is_admin()) with check (is_admin());

drop policy if exists admin_all on recurring_schedules;
create policy admin_all on recurring_schedules for all using (is_admin()) with check (is_admin());

drop policy if exists admin_all on settings;
create policy admin_all on settings for all using (is_admin()) with check (is_admin());

drop policy if exists profile_self_read on profiles;
create policy profile_self_read on profiles for select using (id = auth.uid() or is_admin());

drop policy if exists profile_admin_write on profiles;
create policy profile_admin_write on profiles for all using (is_admin()) with check (is_admin());

drop policy if exists parent_read on clients;
create policy parent_read on clients for select
  using (id = (select client_id from profiles where id = auth.uid()));

drop policy if exists parent_read on students;
create policy parent_read on students for select
  using (client_id = (select client_id from profiles where id = auth.uid()));

drop policy if exists parent_read on sessions;
create policy parent_read on sessions for select
  using (client_id = (select client_id from profiles where id = auth.uid()));
;
