-- Isolated table for the personal Concert Tracker app (single-user).
create table if not exists public.concert_tracker_concerts (
  id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.concert_tracker_concerts enable row level security;

-- Personal single-user app served with the publishable (anon) key.
-- Anon role gets full CRUD on THIS table only.
drop policy if exists "ct anon select" on public.concert_tracker_concerts;
drop policy if exists "ct anon insert" on public.concert_tracker_concerts;
drop policy if exists "ct anon update" on public.concert_tracker_concerts;
drop policy if exists "ct anon delete" on public.concert_tracker_concerts;

create policy "ct anon select" on public.concert_tracker_concerts
  for select to anon, authenticated using (true);
create policy "ct anon insert" on public.concert_tracker_concerts
  for insert to anon, authenticated with check (true);
create policy "ct anon update" on public.concert_tracker_concerts
  for update to anon, authenticated using (true) with check (true);
create policy "ct anon delete" on public.concert_tracker_concerts
  for delete to anon, authenticated using (true);;
