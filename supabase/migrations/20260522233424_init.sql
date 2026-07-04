set search_path = public;

create extension if not exists "pgcrypto";

create table if not exists workspace_members (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table workspace_members enable row level security;

create or replace function is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from workspace_members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function is_workspace_member() from public;
grant execute on function is_workspace_member() to anon, authenticated;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger terms_set_updated_at before update on terms for each row execute function set_updated_at();

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  code text not null,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists courses_term_id_idx on courses(term_id);
create trigger courses_set_updated_at before update on courses for each row execute function set_updated_at();

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  due_date timestamptz not null,
  weight numeric(5,2),
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  mark_received numeric(5,2),
  notes text,
  priority text check (priority in ('low', 'med', 'high')),
  time_estimate_minutes int,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assignments_course_id_idx on assignments(course_id);
create index if not exists assignments_due_date_idx on assignments(due_date);
create index if not exists assignments_status_idx on assignments(status);
create trigger assignments_set_updated_at before update on assignments for each row execute function set_updated_at();

create table if not exists checklists (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checklists_term_id_idx on checklists(term_id);
create trigger checklists_set_updated_at before update on checklists for each row execute function set_updated_at();

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  title text not null,
  due_date timestamptz,
  is_done boolean not null default false,
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checklist_items_checklist_id_idx on checklist_items(checklist_id);
create index if not exists checklist_items_due_date_idx on checklist_items(due_date);
create trigger checklist_items_set_updated_at before update on checklist_items for each row execute function set_updated_at();

create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subtasks_assignment_id_idx on subtasks(assignment_id);
create trigger subtasks_set_updated_at before update on subtasks for each row execute function set_updated_at();

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists attachments_assignment_id_idx on attachments(assignment_id);
create trigger attachments_set_updated_at before update on attachments for each row execute function set_updated_at();

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);
create trigger push_subscriptions_set_updated_at before update on push_subscriptions for each row execute function set_updated_at();

alter table terms              enable row level security;
alter table courses            enable row level security;
alter table assignments        enable row level security;
alter table checklists         enable row level security;
alter table checklist_items    enable row level security;
alter table subtasks           enable row level security;
alter table attachments        enable row level security;
alter table push_subscriptions enable row level security;

create policy terms_workspace on terms for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy courses_workspace on courses for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy assignments_workspace on assignments for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy checklists_workspace on checklists for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy checklist_items_workspace on checklist_items for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy subtasks_workspace on subtasks for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy attachments_workspace on attachments for all to authenticated using (is_workspace_member()) with check (is_workspace_member());
create policy push_subscriptions_workspace on push_subscriptions for all to authenticated using (is_workspace_member()) with check (is_workspace_member());;
