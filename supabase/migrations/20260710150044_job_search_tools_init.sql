-- Job search tools: applications kanban, resume tailoring, STAR story bank
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  url text,
  location text,
  salary text,
  status text not null default 'applied'
    check (status in ('saved','applied','screening','interview','offer','rejected','withdrawn')),
  sort_order double precision not null default 0,
  referral text,
  follow_up_date date,
  posting_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  name text not null,
  role text,
  email text,
  linkedin text,
  is_referral boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table public.job_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  event text not null,
  created_at timestamptz not null default now()
);

create table public.job_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Default',
  content text not null,
  is_default boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.job_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  situation text,
  task text,
  action text,
  result text,
  competencies text[] not null default '{}',
  companies_used text[] not null default '{}',
  practice_count int not null default 0,
  last_practiced_at timestamptz,
  confidence int check (confidence between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_applications_user_status_idx on public.job_applications (user_id, status, sort_order);
create index job_contacts_app_idx on public.job_contacts (application_id);
create index job_activity_app_idx on public.job_activity (application_id, created_at);
create index job_stories_user_idx on public.job_stories (user_id);

alter table public.job_applications enable row level security;
alter table public.job_contacts enable row level security;
alter table public.job_activity enable row level security;
alter table public.job_resumes enable row level security;
alter table public.job_stories enable row level security;

do $$
declare t text;
begin
  foreach t in array array['job_applications','job_contacts','job_activity','job_resumes','job_stories'] loop
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

create or replace function public.job_touch_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger job_applications_touch before update on public.job_applications
  for each row execute function public.job_touch_updated_at();
create trigger job_resumes_touch before update on public.job_resumes
  for each row execute function public.job_touch_updated_at();
create trigger job_stories_touch before update on public.job_stories
  for each row execute function public.job_touch_updated_at();;
