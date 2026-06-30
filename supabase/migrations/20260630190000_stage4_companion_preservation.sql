alter table public.concerts
add column if not exists companions text;

alter table public.concerts
add column if not exists legacy_rank integer check (legacy_rank is null or legacy_rank > 0);

create unique index if not exists concerts_legacy_source_id_uidx
on public.concerts (legacy_source_id)
where legacy_source_id is not null;

create unique index if not exists concerts_legacy_rank_uidx
on public.concerts (legacy_rank)
where legacy_rank is not null;
