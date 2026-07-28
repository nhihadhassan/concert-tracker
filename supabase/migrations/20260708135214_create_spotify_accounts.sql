create table if not exists public.spotify_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  spotify_user_id text,
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spotify_accounts enable row level security;

create policy "spotify_accounts_select_own"
  on public.spotify_accounts for select
  using (auth.uid() = user_id);

create policy "spotify_accounts_insert_own"
  on public.spotify_accounts for insert
  with check (auth.uid() = user_id);

create policy "spotify_accounts_update_own"
  on public.spotify_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "spotify_accounts_delete_own"
  on public.spotify_accounts for delete
  using (auth.uid() = user_id);;
