# Stage 3 Checkpoint

Captured: 2026-06-30

## Completed

- Added a standalone Python rating domain with versioned rules, Decimal arithmetic, and
  deterministic half-up rounding.
- Implemented the exact `3:1:1:1` enjoyment/stage/setlist/seat ratio, missing-score
  renormalization, one-decimal results, a 10-point cap, and documented overrides.
- Return uncapped, calculated, override, final, and combined values explicitly.
- Added separate personal and combined rankings without duplicating rating formulas in React.
- Added spending, yearly trends, projection accuracy and bias, artist/genre/venue summaries,
  repeat-artist analytics, and stable ranking lists.
- Added typed authenticated FastAPI endpoints for the current rule, rating calculations, and
  analytics calculations.
- Prevented clients from submitting custom weights; the server selects the current rule.
- Documented the formulas, golden examples, API request limits, responses, metrics, and errors.
- Kept all Stage 3 endpoints calculation-only. No concert read or write route was added.

## API Contract

- `GET /api/v1/rating-rules/current`
- `POST /api/v1/ratings/calculate`
- `POST /api/v1/analytics/calculate`
- Generated OpenAPI: `/api/v1/openapi.json`
- Interactive documentation: `/api/v1/docs`

Every calculation route requires a valid Supabase token and active `app_members` row. The
machine-readable contract exposes only `reviews` on rating requests and `concerts` on analytics
requests, so browser code cannot override the rating rule.

## Verification

- `npm run check`: pass; 3 frontend tests and 31 backend/domain/API tests.
- `npm run build`: pass; npm reported zero dependency vulnerabilities.
- Golden full and partial rating cases: pass.
- Exceptional component, empty review, override, and midpoint rounding cases: pass.
- Stage 0 cloud fixture: 46 concerts, 44 rated rows, `$4,353.12` non-cancelled spend,
  `8.29` average rating, and the complete historical ranking order reproduced.
- Local OpenAPI inspection: version `0.2.0`, five routes, no client rule input.
- Preview health: HTTP `200`, version `0.2.0`, `data_mode: staging`.
- Unauthenticated current-rule request: HTTP `401`.
- Nhihad authenticated rule, rating, and analytics requests: HTTP `200` with golden outputs.
- Rachel authenticated current-rule request: HTTP `200`.
- Vercel error-log scan: no errors found.
- Production alias inspection: still points to deployment `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd`
  from 2026-06-24.

## Preview

- URL: https://concert-tracker-a6zrnp1ad-nhihadhassan-2432s-projects.vercel.app
- Deployment: `dpl_CYFBLaGspHk8Tv3B4h9tTzUrrWBB`
- Target: preview only
- Status: Ready
- Protection: Vercel authentication remains enabled
- Frontend bundle: 424.38 kB JavaScript and 15.18 kB CSS before compression
- Backend function bundle: 24.16 MB
- Production URL: unchanged legacy application

## Environment Repair

The first Stage 3 preview revealed that both Preview publishable-key variables existed but held
empty values. They were restored in Preview only from the same public `rachel-tracker` key used
by the legacy browser app, marked sensitive in Vercel, and verified with both member accounts.
No service-role key was added to Vercel. Production environment variables were not changed.

## Cost And Data Safety

- No paid service or dependency was added.
- The deployment remains on Vercel Hobby and uses the existing Supabase Free project.
- The 24.16 MB backend function is well below Vercel's deployment limit and Stage 3 makes no
  background calls.
- No normalized or legacy concert row was inserted, updated, migrated, or deleted.
- No schema migration was added or applied.
- The production deployment was not changed.

## Known Limits

- The API calculates from caller-supplied snapshots; database-backed library reads begin in
  Stage 5 after the Stage 4 migration dry run.
- The React dashboard still displays Stage 1 fixture concerts after authentication.
- The current rule is selected from the Python versioned domain. Persisted rule lookup is added
  with the database-backed application flow, while historical reviews retain their rule version.
- Analytics group names use conservative legacy normalization for year-suffixed artist labels
  and final parenthetical venue addresses.

## Rollback

- Delete preview deployment `dpl_CYFBLaGspHk8Tv3B4h9tTzUrrWBB` if it is no longer needed.
- Revert the Stage 3 commit to remove the calculation routes and domain engine.
- Preview publishable keys may remain for the approved Stage 2 Auth flow; removing them disables
  preview sign-in without affecting production.
- No database rollback is required because Stage 3 made no database changes.

## Checkpoint Result

**PASS - awaiting approval before Stage 4.**

Stage 4 must not begin until this checkpoint is explicitly approved.
