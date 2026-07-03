# Stage 8 Checkpoint

Captured: 2026-07-03

## Production Cutover

- Supabase project: `rachel-tracker` (`zgafubhzhxikuknihmnu`).
- Vercel production deployment: `dpl_BDb3RD5NCTZUcNyryUzrzfvKA8g4`.
- Production URL: `https://concert-tracker-sepia.vercel.app`.
- Production status: Ready.
- Frontend: React, Vite, and TypeScript.
- API: FastAPI function, 10.8 MB deployed bundle.
- The five Supabase/Auth variables now exist in both Preview and Production.
- Legacy deployment `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd` remains available for rollback.

## Recovery Backups

Pre-cutover bundle:

- `data/backups/stage-8-pre-cutover/20260703T173945Z/`
- Fresh 46-row legacy Supabase JSON export.
- Fresh browser-compatible `concertTracker.v1` JSON snapshot.
- App members, rating rule, and all normalized tables.
- Fresh pre-cutover SQLite and six-sheet Excel copies.
- File permissions restricted to the local owner.

Post-cutover bundle:

- `data/backups/stage-8-post-cutover/20260703T175421Z/`
- All cloud rows, including retained soft-deleted verification history.
- Fresh post-cutover SQLite and Excel copies.
- Active local snapshot: 46 concerts, 66 attendees, and 54 reviews.

Supabase's optional SQL dump could not run because Docker Desktop is not installed. The complete
service-role JSON export is the verified Supabase rollback backup; no dependency or paid service
was added during cutover.

## Schema And Migration

- Recovered the complete remote migration history into `supabase/migrations/`.
- Confirmed the linked project is `rachel-tracker` and `ACTIVE_HEALTHY`.
- Applied only `20260701110000_stage6_soft_delete_rls.sql` after a clean dry run.
- Local and remote migration histories now match through Stage 6.
- Inserted 46 concerts, 66 attendee rows, and 54 review rows.
- Repeated the production migration with zero inserts, zero conflicts, and identical counts.
- Preserved the 46-row `concert_tracker_concerts` legacy table unchanged.
- Preserved the soft-deleted Stage 6 fixture as audit history and excluded it from active counts.
- No base64 artwork required a Storage upload.

## Data Verification

- Active normalized counts: 46 concerts, 66 attendees, 54 reviews, and 2 members.
- Historical status totals: 44 attended, 1 cancelled, and 1 upcoming.
- Non-cancelled spend: `$4,353.12`.
- All 44 Nhihad ranking rows match the approved Stage 0 fixture exactly.
- Nhihad average: `8.29`; combined average: `8.36`.
- The local backup completed with matching cloud counts and deterministic checksums.
- SQLite `integrity_check` and Excel reopen/render checks remain part of the Stage 7 backup path.

## Auth And Workflow Verification

- Nhihad and Rachel both signed in with their Keychain-managed passwords.
- Anonymous library access returned HTTP `401`.
- Auth, active membership, shared reads, own-review writes, and cross-review denial passed.
- Public signup remains disabled.
- Nhihad created a temporary shared concert and review through production FastAPI.
- Reusing the create idempotency key returned the saved response without duplication.
- Rachel saw the shared concert, edited it, and created her own independent review.
- A stale update returned HTTP `409` instead of overwriting the newer row.
- Authenticated CSV export contained the temporary concert.
- The fixture was soft-deleted and both active libraries returned to 46 concerts.

## Browser And Deployment Verification

- Production shell returned HTTP `200`.
- API health returned HTTP `200`, version `0.3.0`.
- Password login rendered `Showing 46 of 46 cloud concerts`.
- No Offline marker, error overlay, console error, or page error appeared.
- Production screenshot: `data/migrations/stage-8/production-desktop.png`.
- Vercel production error-log scan returned no errors.
- The dashboard remains visually consistent with the approved Stage 6 design.

## Cost

- Vercel remains on Hobby and Supabase remains on Free.
- No paid API, domain, monitor, scheduler, storage service, or plan upgrade was added.
- Current data volume is negligible relative to the documented free limits.
- The existing Mac continues to own all scheduled backup work.

## Rollback

1. Reassign `concert-tracker-sepia.vercel.app` to legacy deployment
   `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd`.
2. Leave the normalized tables in place but stop application writes while investigating.
3. Use the pre-cutover JSON, SQLite, or Excel bundle for comparison and recovery.
4. The legacy table remains unchanged and can immediately serve the old static application.
5. Do not remove normalized data, migration history, or legacy assets during Stage 9 observation.

## Checkpoint Result

**PASS - production cutover complete; Stage 9 observation begins 2026-07-03.**

Legacy cleanup remains blocked until the full 30-day observation requirement passes.
