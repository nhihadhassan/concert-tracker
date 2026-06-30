# Stage 4 Checkpoint

Captured: 2026-06-30

## Completed

- Added deterministic cloud/browser reconciliation with cloud-authoritative conflict handling.
- Converted copied JSON rows into normalized concerts, attendees, and separate personal reviews.
- Converted `rachelAttended` into Rachel attendee rows and `rachelScore` into documented legacy
  overrides.
- Preserved historical realized ratings with overrides only where the Python engine differs or
  lacks component scores.
- Preserved the complete Stage 0 ranking order, including equal-rating tie order.
- Preserved artwork URLs, Spotify links, notes, companions, dates, prices, seats, genres,
  projected ratings, statuses, and event types.
- Added tested base64 artwork extraction and content-addressed storage manifests. The current
  source contains no base64 artwork, so no storage upload is required.
- Added per-row conversion events, deterministic checksums, and automatic second-pass
  idempotency verification.
- Added a pending schema migration for companion preservation and stable legacy tie ranks.

## Dry-Run Result

- Cloud inputs: 46 converted.
- Browser inputs: 45 matched and skipped in favor of cloud; 0 browser-only imports.
- Invalid rows: 0.
- Normalized concerts: 46.
- Attendees: 66 total, comprising 46 Nhihad rows and 20 Rachel rows.
- Reviews: 54 total, comprising 44 Nhihad reviews and 10 Rachel reviews.
- Overrides: 38 Nhihad and 10 Rachel, all with reasons.
- Artwork: 14 remote URLs preserved, 0 base64 assets, 32 empty.
- Historical totals: 44 attended, 1 cancelled, 1 upcoming, and `$4,353.12` non-cancelled spend.
- Historical ratings: 44 rated, `8.29` Nhihad average, full approved ranking order preserved.
- Second run: 0 inserts, 0 updates, identical destination checksum.

Private artifacts:

- Pre-run snapshot: `data/backups/stage-4-pre-dry-run/20260630T193650Z/`
- Dry-run output: `data/migrations/stage-4/20260630T193708Z/`
- Destination checksum: `6e02ebc18f55dd05681bb5ee392cdebc4ee90c4c660962460f143cbf54a920e3`

## Verification

- `npm run check`: pass; 3 frontend tests and 37 backend/domain/API/migration tests.
- Private full-data migration test: pass.
- Every 46 converted and 45 skipped source row appears in the report.
- Concert, attendee, review, source ID, and legacy rank uniqueness checks: pass.
- Required-field and documented-override checks: pass.
- Synthetic browser-only, cloud-conflict, invalid-row, and base64-artwork cases: pass.
- Fresh post-run cloud counts: 46 legacy concerts and 0 normalized concerts/attendees/reviews.
- Fresh legacy export: row-for-row identical to the dry-run source backup.
- Preview health: HTTP `200`, version `0.2.0`, `data_mode: staging`.
- Preview calculation without Auth: HTTP `401`.
- Vercel error-log scan: no errors found.
- Production alias: unchanged June 24 legacy deployment.

## Preview

- URL: https://concert-tracker-7q1r4p5q4-nhihadhassan-2432s-projects.vercel.app
- Deployment: `dpl_8cdbB1MQQf6u8XQXeka1bZWLxozb`
- Target: preview only
- Status: Ready
- Backend function bundle: 24.18 MB
- Production URL: unchanged legacy application

## Schema Status

`20260630190000_stage4_companion_preservation.sql` is pending and unapplied. It adds:

- `concerts.companions`
- `concerts.legacy_rank`
- A unique partial legacy-source index for idempotent production upserts
- A unique partial legacy-rank index for deterministic historical ties

## Cost And Data Safety

- No paid service, API, storage upload, background job, or production deployment was added.
- Supabase was read only during the fresh staging snapshot and post-run count checks.
- The legacy table, normalized tables, Auth users, and rating rule remain unchanged.
- All raw and generated migration artifacts remain excluded from Git and Vercel.

## Known Limits

- The dry run generates a reviewed destination copy but intentionally does not write it to
  Supabase.
- The pending schema migration must be applied before normalized rows can be loaded.
- Storage upload behavior is covered by synthetic tests because the current source has no
  base64 artwork.
- Stage 5 may read the dry-run model for fixture development, but cloud CRUD must not assume the
  data is loaded before Stage 8.

## Rollback

- Delete the ignored Stage 4 snapshot and output folders to discard the dry run.
- Revert the Stage 4 commit to remove the transformer and pending SQL.
- No database rollback is required because no migration or normalized data was applied.

## Checkpoint Result

**PASS - awaiting approval before Stage 5.**

Stage 5 must not begin until this checkpoint is explicitly approved.
