
alter table sessions
  add column if not exists google_event_id text;

create index if not exists sessions_google_event_id_idx on sessions (google_event_id) where google_event_id is not null;
;
