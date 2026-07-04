alter table public.concerts
add column if not exists last_mutation_id uuid;

alter table public.concert_attendees
add column if not exists last_mutation_id uuid;

alter table public.concert_reviews
add column if not exists last_mutation_id uuid;

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

create index if not exists api_idempotency_keys_created_idx
on public.api_idempotency_keys (created_at);

alter table public.api_idempotency_keys enable row level security;
revoke all on public.api_idempotency_keys from anon, authenticated;
grant select, insert on public.api_idempotency_keys to authenticated;

create policy api_idempotency_keys_select_own
on public.api_idempotency_keys for select
to authenticated
using (
  (select public.is_app_member())
  and user_id = (select auth.uid())
);

create policy api_idempotency_keys_insert_own
on public.api_idempotency_keys for insert
to authenticated
with check (
  (select public.is_app_member())
  and user_id = (select auth.uid())
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['concerts', 'concert_attendees', 'concert_reviews']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
