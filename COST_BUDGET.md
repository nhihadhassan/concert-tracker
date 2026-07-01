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
