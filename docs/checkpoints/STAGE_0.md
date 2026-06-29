# Stage 0 Checkpoint

Captured: 2026-06-29

## Completed

- Preserved desktop, mobile, and add-concert screenshots.
- Created timestamped backups of the legacy HTML, embedded seed, parsed source workbook rows, and live browser `localStorage` snapshot.
- Added SHA-256 checksums for every private backup artifact.
- Confirmed 45 concert records in the workbook, embedded seed, and live browser cache.
- Confirmed the browser offline outbox was empty at capture time.
- Confirmed the embedded seed and live browser values match across every legacy core field.
- Recorded expected workbook drift on 29 concerts: 17 genre fields and 12 Spotify links differ from the newer app data.
- Generated current stats, rankings, field schema, and source-comparison fixtures.
- Documented the product, rating rules, current/target architecture, and zero-cost budget.
- Added a reproducible cloud export path using a service-role key stored in macOS Keychain.
- Exported all 46 protected Supabase rows into a timestamped private backup.
- Confirmed the cloud contains all 45 browser concert identities plus one cloud-only concert: J Cole on July 28, 2026.
- Identified two records with newer cloud values: ASAP Rocky on May 31, 2026, and Don Toliver on June 5, 2026.
- Confirmed the cloud UUIDs differ from the fresh browser UUIDs, so migration reconciliation must use stable concert identity rather than legacy IDs.

## Reconciliation Decision

- Supabase is the authoritative source for migration conflicts.
- Preserve the cloud-only J Cole record.
- Preserve the newer cloud status, review, companion, and Spotify values for the two differing records.
- Match legacy records by normalized artist and date during the dry run; do not rely on regenerated browser UUIDs.
- Keep the 45-record browser snapshot as the visual and offline-behavior baseline, not as the migration authority.

## Verification

- Supabase endpoint is reachable after project resume.
- Anonymous reads return zero rows, confirming RLS protects the legacy table.
- Authorized export status is `complete` with 46 rows and a SHA-256 checksum.
- Every raw backup is stored under ignored `data/backups/stage-0/`.
- Safe fixtures and screenshots are versioned under `docs/`.
- No production writes or deployments were performed.

## Checkpoint Result

**PASS - awaiting approval before Stage 1.**

Stage 1 must not begin until this checkpoint is explicitly approved.

## Production Changes

None. Stage 0 performed read-only capture and local documentation only.
