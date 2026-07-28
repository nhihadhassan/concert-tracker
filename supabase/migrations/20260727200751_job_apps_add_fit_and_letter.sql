alter table public.job_applications
  add column if not exists fit_score int check (fit_score between 0 and 100),
  add column if not exists fit_analysis text,
  add column if not exists cover_letter text,
  add column if not exists date_applied date;

-- Backfill date_applied for anything already past the "saved" stage.
update public.job_applications
  set date_applied = created_at::date
  where date_applied is null and status <> 'saved';;
