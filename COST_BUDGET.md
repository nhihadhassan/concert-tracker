# Cost Budget

## Target

The current two-user personal tracker must remain at `$0/month`.

## Vercel Hobby

Official reference: https://vercel.com/docs/plans/hobby

- Personal, non-commercial use.
- 1,000,000 function invocations per month.
- 4 active CPU-hours per month.
- 360 GB-hours of provisioned memory per month.
- Existing `vercel.app` domain remains free.

## Supabase Free

Official reference: https://supabase.com/pricing

- 500 MB database.
- 1 GB file storage.
- 5 GB uncached and 5 GB cached egress.
- 50,000 monthly active users.
- Free projects may pause after one week of inactivity.

## Guardrails

- No paid APIs, observability services, image transformations, animation services, domains, or automatic upgrades.
- Resize custom artwork before upload and retain external artwork URLs where possible.
- Generate SQLite and Excel locally rather than inside Vercel Functions.
- Keep server dependencies small and avoid pandas in the deployed API.
- Review usage at every checkpoint and stop the rollout if any resource reaches 70% of a free quota.

## Stage 0 Snapshot

- Vercel environment variables: none.
- Vercel project: `concert-tracker` on the existing Hobby account.
- Supabase endpoint: resumed and reachable; anonymous table reads return no protected rows.
- Current protected cloud scale: 46 concerts and two planned users, far below documented free limits.

## Stage 5 Snapshot

- One Vite static service and one small FastAPI function remain on Vercel Hobby.
- The deployed Python bundle contains no pandas, background worker, or paid integration.
- Supabase adds one small idempotency table and Realtime publication entries for three normalized
  tables; the normalized library remains empty until production migration.
- Offline caching uses browser IndexedDB and adds no hosted storage cost.
- The 46-row legacy table and production static deployment remain unchanged.

## Stage 6 Snapshot

- Motion is an open-source client dependency and adds no hosted service, API, worker, or fee.
- The preview remains one Vite static service and one 24.26 MB FastAPI function on Vercel Hobby.
- The production JavaScript bundle is 165.73 kB gzip; Motion DOM features are loaded lazily.
- Three small RLS policies were added. Normalized active concerts remain at zero and the legacy
  table remains at 46 rows.
- Production still serves the legacy June 24 deployment; Stage 6 is preview-only.

## Stage 7 Snapshot

- The backup agent runs on the existing Mac with launchd and adds no hosted worker or scheduler.
- SQLite uses Python's standard library. Excel uses the existing local artifact runtime.
- Backups, logs, configuration, and credentials remain local and are excluded from Vercel.
- Thirty workbook archives at the current data scale remain negligible compared with cloud
  storage quotas because they consume no Supabase or Vercel storage.
- No paid API, email, monitor, domain, database, storage service, or plan upgrade was added.

## Stage 8 Snapshot

- Production remains one Vite static frontend and one 10.8 MB FastAPI function on Vercel Hobby.
- Supabase Free stores 46 active concerts, 66 attendee rows, 54 reviews, two members, and small
  audit/idempotency tables.
- The 46-row legacy table is retained temporarily for rollback and remains negligible in size.
- Browser assets total approximately 166 kB gzip for JavaScript and 5.3 kB gzip for CSS.
- Backups and the 30-workbook retention policy remain on the existing Mac, not cloud storage.
- No paid API, monitor, domain, scheduler, service, or automatic upgrade was added.

## Stage 9 Snapshot

- Initial Supabase database usage is 16 MB, or 3.2% of the 500 MB free allowance.
- Production remains one static frontend and one 10.8 MB FastAPI function on Vercel Hobby.
- The monitor runs locally and writes ignored JSON reports; it adds no hosted service.
- The weekly Codex automation invokes the local read-only monitor and cannot alter cloud data.
- Exact Vercel invocation, CPU, memory, and egress percentages require a weekly Usage dashboard
  review because the project CLI does not expose those quota totals.
- The 70% stop threshold remains active for every Vercel and Supabase allowance.
