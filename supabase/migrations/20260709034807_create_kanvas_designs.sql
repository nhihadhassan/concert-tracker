create table if not exists public.kanvas_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled design',
  data jsonb not null,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kanvas_designs_user_updated_idx
  on public.kanvas_designs (user_id, updated_at desc);

alter table public.kanvas_designs enable row level security;

drop policy if exists "kanvas: select own" on public.kanvas_designs;
create policy "kanvas: select own" on public.kanvas_designs
  for select using (auth.uid() = user_id);

drop policy if exists "kanvas: insert own" on public.kanvas_designs;
create policy "kanvas: insert own" on public.kanvas_designs
  for insert with check (auth.uid() = user_id);

drop policy if exists "kanvas: update own" on public.kanvas_designs;
create policy "kanvas: update own" on public.kanvas_designs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kanvas: delete own" on public.kanvas_designs;
create policy "kanvas: delete own" on public.kanvas_designs
  for delete using (auth.uid() = user_id);;
