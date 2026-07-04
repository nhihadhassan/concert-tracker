
create table if not exists google_oauth_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create unique index if not exists google_oauth_tokens_user_id_idx
  on google_oauth_tokens(user_id);

create trigger set_google_oauth_tokens_updated_at
  before update on google_oauth_tokens
  for each row execute function set_updated_at();

alter table google_oauth_tokens enable row level security;

create policy "workspace members only" on google_oauth_tokens
  for all
  using (is_workspace_member())
  with check (is_workspace_member());

alter table assignments
  add column if not exists gcal_event_id text;

alter table checklist_items
  add column if not exists gcal_event_id text;
;
