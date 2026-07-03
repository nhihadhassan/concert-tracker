# Stage 7 Checkpoint

Captured: 2026-07-03

## Completed

- Added a Mac-only Python backup subsystem under `sync/`.
- Authenticated as Nhihad and stored the rotating Supabase refresh token in macOS Keychain.
- Reused the FastAPI Python library, rating, ranking, and analytics pipeline.
- Wrote SQLite through a same-directory temporary file, integrity check, and atomic replacement.
- Generated the six-sheet Excel workbook from the same canonical snapshot.
- Retained 30 dated workbook archives and kept `concerts-latest.xlsx` atomic.
- Added deterministic counts and SHA-256 checksums for every flattened dataset.
- Installed `com.nhihad.concert-tracker-backup` for 2:00 AM local Toronto time.
- Added `RunAtLoad` with a 24-hour freshness check for missed-run catch-up.
- Excluded the entire local backup subsystem and its private outputs from Git and Vercel.
- Added tested recovery and uninstall instructions in `docs/BACKUP_RESTORE.md`.

## Installed State

- LaunchAgent: `~/Library/LaunchAgents/com.nhihad.concert-tracker-backup.plist`
- Program: `~/dev/Concert Tracker/.venv/bin/python`
- Schedule: hour 2, minute 0; `RunAtLoad = true`.
- Current status: idle, `last exit code = 0`.
- Successful catch-up run: 2026-07-03.
- Immediate manual run: passed.
- Fresh scheduled rerun: skipped as current, exited 0.
- Refresh token Keychain entry: present.

The first launchd attempt exposed that resolving `.venv/bin/python` bypassed the environment and
lost `httpx`. The failed run logged the exact error and created no backup. The installer now
preserves the explicit virtual-environment entry path; the regression is covered by a test.

## Live Backup Verification

The normalized staging library remains intentionally empty until Stage 8:

- Members: 2
- Concerts: 0
- Attendees: 0
- Reviews: 0
- Rankings: 0
- Analytics records: 15

SQLite verification:

- `PRAGMA integrity_check`: `ok`.
- Counts match the canonical cloud snapshot.
- Per-table checksums match the canonical cloud snapshot.
- File mode: owner read/write only.

Excel verification:

- Sheets: Concerts, Attendees, Reviews, Rankings, Analytics, Sync Metadata.
- Saved workbook reopened through the artifact runtime before inspection.
- Every sheet rendered and received a visual QA pass.
- Formula/error scan: 0 matches.
- Latest workbook and newest dated archive: identical SHA-256.
- Archive retention test: newest 30 kept, older files removed.

Restore verification:

- Copied SQLite recovery file opened read-only and returned `ok`.
- Copied Excel recovery file passed complete ZIP integrity testing.
- Interrupted SQLite write test preserved the prior file byte-for-byte.

## Cost And Deployment

- No paid service, hosted scheduler, cloud storage, API, monitor, or plan upgrade was added.
- All recurring work runs on the existing Mac.
- Local backup code is excluded from Vercel's frontend upload and backend function bundle.
- Preview deployment: `dpl_DjQxRL3rhWGsRrVBXofNia32fX5r` (`READY`).
- Preview URL: `https://concert-tracker-6bj23zlln-nhihadhassan-2432s-projects.vercel.app`.
- Frontend returned HTTP 200; API health returned HTTP 200 in staging mode.
- An unauthenticated library request returned HTTP 401 as required.
- The Python function bundle remains 24.26 MB and the post-deploy error scan was clean.
- Supabase and the production legacy deployment were not modified.
- Production remains `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd` at
  `https://concert-tracker-sepia.vercel.app`.
- Active normalized staging counts remain unchanged.

## Rollback

- Run `.venv/bin/python -m sync.launchd uninstall` to stop scheduling.
- Revert the Stage 7 commit to remove the local backup implementation.
- Preserve `data/concert_tracker.sqlite3`, `data/exports/`, and the Keychain refresh token until
  recovery copies are no longer needed.
- No cloud schema or production deployment rollback is required.

## Checkpoint Result

**PASS - awaiting approval before Stage 8.**

Stage 8 must not begin until this checkpoint passes and is explicitly approved.
