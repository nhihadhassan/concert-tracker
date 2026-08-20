# Backup And Restore

## Schedule And Authority

Whichever database `DATA_PROVIDER` selects (Neon in production; see `docs/DATA_PROVIDERS.md`)
remains authoritative. The Mac copies are read-only recovery artifacts and never write to cloud
tables.

The LaunchAgent label is `com.nhihad.concert-tracker-backup`. It runs at 2:00 AM in the Mac's
local timezone, currently `America/Toronto`, and runs a catch-up check at login. Catch-up skips
when the last successful backup is less than 24 hours old.

## Files

- SQLite latest: `data/concert_tracker.sqlite3`
- Excel latest: `data/exports/concerts-latest.xlsx`
- Excel archives: `data/exports/archive/concerts-*.xlsx`
- Backup log: `data/logs/backup.log`
- launchd logs: `data/logs/launchd.out.log` and `data/logs/launchd.err.log`
- Local config: `~/Library/Application Support/Concert Tracker Backup/config.json`

The workbook contains Concerts, Attendees, Reviews, Rankings, Analytics, and Sync Metadata
sheets. The metadata sheet records counts and deterministic checksums for the cloud snapshot.

## Manual Backup

```bash
cd "~/dev/Concert Tracker"
.venv/bin/python -m sync.backup --now
```

The command exits nonzero on failure and leaves the previous SQLite and Excel files unchanged.

## Status

```bash
.venv/bin/python -m sync.launchd status
tail -50 data/logs/backup.log
```

A healthy idle agent reports `state = not running` and `last exit code = 0`; launchd starts it
only for the calendar or login trigger.

## Install Or Refresh

There is no sign-in anymore -- the agent reads with the same single configured credential the
deployed backend uses, matching whichever `DATA_PROVIDER` is active (see
`docs/DATA_PROVIDERS.md`):

```bash
# Supabase (default)
.venv/bin/python -m sync.launchd install \
  --supabase-url "https://PROJECT_REF.supabase.co" \
  --publishable-key "sb_publishable_REPLACE_ME" \
  --secret-key "sb_secret_REPLACE_ME" \
  --python-path "$PWD/.venv/bin/python"

# Neon
.venv/bin/python -m sync.launchd install \
  --supabase-url "https://PROJECT_REF.supabase.co" \
  --publishable-key "sb_publishable_REPLACE_ME" \
  --data-provider neon \
  --database-url "postgresql://REPLACE_ME" \
  --python-path "$PWD/.venv/bin/python"
```

`--supabase-url`/`--publishable-key` stay required either way (kept for a clean fallback to
Supabase without reinstalling), but only the credential matching `--data-provider` is actually
used to read. The explicit virtual-environment path must remain unresolved so launchd uses
installed Python dependencies. Installation writes the local config, reloads the LaunchAgent, and
triggers the catch-up check.

## Validate A Recovery Copy

Work on a copy, not the latest file:

```bash
RESTORE_DIR="$(mktemp -d)"
cp data/concert_tracker.sqlite3 "$RESTORE_DIR/restored.sqlite3"
cp data/exports/concerts-latest.xlsx "$RESTORE_DIR/restored.xlsx"

sqlite3 -readonly "$RESTORE_DIR/restored.sqlite3" \
  "PRAGMA integrity_check; SELECT COUNT(*) FROM concerts;"
unzip -t "$RESTORE_DIR/restored.xlsx"
```

`PRAGMA integrity_check` must return `ok`, and the workbook ZIP test must report no errors.
Counts and checksums are available in `sync_metadata` and the workbook's Sync Metadata sheet.

## Cloud Restoration

There is intentionally no automatic restore-to-cloud command. Review the selected recovery copy,
take a fresh cloud backup, and use the approved idempotent migration/import path. This prevents a
stale local copy from overwriting newer shared data.

## Uninstall

```bash
.venv/bin/python -m sync.launchd uninstall
```

Uninstalling removes the LaunchAgent but preserves config, logs, and all recovery copies.
