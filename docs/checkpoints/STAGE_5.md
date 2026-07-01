# Stage 5 Checkpoint

Captured: 2026-07-01

## Completed

- Connected the React application to authenticated FastAPI library endpoints.
- Added cloud concert create, edit, soft delete, attendance, separate personal reviews, filters,
  sorting, personal and combined rankings, artwork fields, dark mode, and authenticated CSV
  export.
- Kept all rating and analytics calculations in the Python domain layer.
- Added TanStack Query cloud state, an IndexedDB snapshot, an offline mutation outbox, and
  automatic reconnect replay.
- Added UUID idempotency keys, mutation recovery markers, expected row versions, HTTP `409`
  responses, and an explicit keep-local/use-cloud conflict dialog.
- Added Supabase Realtime invalidation for concerts, attendees, and reviews.
- Added accurate Synced, Syncing, Pending, Offline, Error, and Needs review UI states.
- Added focused FastAPI, migration-contract, React workflow, and regression tests.

## Schema And Safety

- Pre-schema backup: `data/backups/stage-5-pre-schema/20260701T044553Z/`.
- Applied the approved Stage 4 companion-preservation migration to the empty normalized schema.
- Applied `20260701010000_stage5_functional_cloud.sql`.
- Added `last_mutation_id` to concerts, attendees, and reviews.
- Added the RLS-protected `api_idempotency_keys` table.
- Added the three mutable normalized tables to the Realtime publication.
- Kept `concert_tracker_concerts` unchanged at 46 rows.
- Cleaned all synthetic browser/API rows after verification: normalized concerts, attendees,
  reviews, and idempotency keys each returned to 0 rows.

## Live Workflow Verification

- Nhihad created a shared concert and replayed the same idempotency key without duplication.
- Rachel read the shared row and added a separate review.
- Personal Rachel rating returned `8.3`; combined rating returned `8.7`.
- Attendance updates, CSV export, and current-version edits succeeded.
- A stale edit returned HTTP `409` and supplied the current cloud version.
- Browser offline creation remained visible with a pending badge while FastAPI was stopped.
- Restarting FastAPI replayed the queued create exactly once and returned the header to Synced.
- A browser edit made stale by a concurrent cloud update opened the conflict dialog. Choosing
  Keep my changes retried against the current row version, cleared the pending state, and
  preserved the intended note.
- Both test concerts and all related rows were removed after verification.

## Verification

- `npm run check`: pass; 4 frontend tests and 43 backend/domain/API/migration tests.
- `npm run build`: pass; 471.73 kB JavaScript, 134.49 kB gzip.
- Browser desktop and mobile workflows: pass.
- Mobile width: 390 CSS px with no horizontal overflow.
- Add/edit dialog: fits the mobile viewport and remains scrollable.
- Current browser errors after the ranking-date regression fix: none.
- Checkpoint captures: `docs/checkpoints/stage-5/desktop.png` and `mobile.png`.
- Preview health: HTTP `200`, version `0.3.0`, `data_mode: staging`.
- Preview library without Auth: HTTP `401`.
- Preview library with Auth: HTTP `200`, both members, 0 normalized concerts, combined rankings.
- Fresh password sign-in: HTTP `200` for both Nhihad and Rachel using their Keychain-managed
  credentials.
- Vercel error-log scan: no errors found.

## Preview

- URL: https://concert-tracker-ikubveg7t-nhihadhassan-2432s-projects.vercel.app
- Deployment: `dpl_3cE9gsXNLV1Ntx4V5JqEct22kRNA`
- Target: preview only.
- Status: Ready.
- Backend function bundle: 24.23 MB.
- Production URL: unchanged legacy application, deployment
  `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd` from June 24.

## Cost And Known Limits

- No paid service, API, domain, monitor, image pipeline, or background worker was added.
- The normalized staging library intentionally remains empty until the Stage 8 migration.
- IndexedDB is a temporary offline queue, not an independent source of truth.
- Realtime invalidates cached reads; all writes still pass through FastAPI and RLS.
- Vercel-protected previews require a Vercel session, so visual end-to-end verification used the
  identical local Vite and FastAPI services.

## Rollback

- Roll back the Stage 5 preview deployment; production is unaffected.
- Revert the Stage 5 commit to remove the React cloud workflow and API routes.
- Drop `api_idempotency_keys`, remove the three `last_mutation_id` columns, and remove the three
  tables from the Realtime publication only if a database rollback is explicitly approved.
- The pre-schema backup and 46-row legacy table remain available throughout rollback.

## Checkpoint Result

**PASS - awaiting approval before Stage 6.**

Stage 6 must not begin until this checkpoint passes and is explicitly approved.
