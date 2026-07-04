
create table schedule_proposals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students on delete cascade,
  client_id uuid not null references clients on delete cascade,
  semester_label text not null,
  proposed_slots jsonb not null default '[]'::jsonb,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'needs_rescheduling')),
  confirmed_slot jsonb,
  parent_notes text,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on schedule_proposals(student_id);
create index on schedule_proposals(client_id);
create index on schedule_proposals(token);
create index on schedule_proposals(status);

alter table schedule_proposals enable row level security;

create policy admin_all on schedule_proposals
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy public_read on schedule_proposals
  for select
  using (true);

create or replace function public.respond_to_proposal(
  p_token text,
  p_status text,
  p_confirmed_slot jsonb,
  p_parent_notes text
) returns void language plpgsql security definer as $$
begin
  if p_status not in ('confirmed', 'declined', 'needs_rescheduling') then
    raise exception 'Invalid status';
  end if;
  update schedule_proposals
  set
    status         = p_status,
    confirmed_slot = p_confirmed_slot,
    parent_notes   = p_parent_notes,
    updated_at     = now()
  where token = p_token;
  if not found then
    raise exception 'Proposal not found';
  end if;
end;
$$;
;
