# Concert Tracker

A private shared concert tracker for logging, rating, and comparing upcoming and attended shows.

The application, branded **Encore**, uses React, TypeScript, and FastAPI with a configurable
Postgres data provider. The legacy static dashboard and data remain rollback assets; see the
stabilization runbook before any cleanup.

## Concerts: Classic and Stage

Classic remains the default Concerts page. **Stage** is a separate cinematic view of the same
library, with a full-screen artist stage, moving lights and haze, floating flip ticket, glowing
posters, concert ribbon, animated detail entrances, year atmospheres, and personal Replay.

- [Classic](https://concert-tracker-sepia.vercel.app/)
- [Stage](https://concert-tracker-sepia.vercel.app/?view=stage)

The two designs are intentionally retained so the owner can choose a direction later. For
interface changes, start with the [Stage design guide](docs/STAGE_DESIGN.md) and
[agent instructions](AGENTS.md). Keep copy brief and factual; preserve mobile, keyboard, and
reduced-motion behavior.

## Documentation

- [Product](PRODUCT.md)
- [Rating rules](RATING_RULES.md)
- [Architecture](ARCHITECTURE.md)
- [Stage design and motion guide](docs/STAGE_DESIGN.md)
- [Agent instructions](AGENTS.md)
- [Frontend development](frontend/README.md)
- [Cost budget](COST_BUDGET.md)
- [Stage 0 checkpoint](docs/checkpoints/STAGE_0.md)
- [Stage 1 checkpoint](docs/checkpoints/STAGE_1.md)
- [Stage 2 checkpoint](docs/checkpoints/STAGE_2.md)
- [Stage 3 API contract](docs/API.md)
- [Stage 3 checkpoint](docs/checkpoints/STAGE_3.md)
- [Migration design](docs/MIGRATION.md)
- [Stage 4 checkpoint](docs/checkpoints/STAGE_4.md)
- [Stage 5 checkpoint](docs/checkpoints/STAGE_5.md)
- [Stage 6 checkpoint](docs/checkpoints/STAGE_6.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Stage 7 checkpoint](docs/checkpoints/STAGE_7.md)
- [Stage 8 checkpoint](docs/checkpoints/STAGE_8.md)
- [Production stabilization](docs/STABILIZATION.md)
- [Stage 9 checkpoint](docs/checkpoints/STAGE_9.md)

## Current Stack

- React, Vite, and TypeScript
- FastAPI on Vercel Functions
- Provider-selected Postgres (Neon or Supabase; see [data providers](docs/DATA_PROVIDERS.md))
- CSS perspective and Motion for the optional Stage view, Record Room, and Wrapped
- TanStack Query with IndexedDB snapshot/outbox support
- Shared Spotify album shelf with private drafts and personal song rankings
- Local atomic SQLite and Excel backups through macOS launchd

## Production

`https://concert-tracker-sepia.vercel.app`

## Rebuild Development

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
npm install --prefix frontend
npx vercel dev -L
```

The integrated application is available at `http://localhost:3000`; FastAPI health is at `http://localhost:3000/api/v1/health`.

Run the complete rebuild quality gate with:

```bash
npm run check
npm run build
```

The application has no sign-in. Every request runs as the single identity described by
`PUBLIC_USER_ID`, `PUBLIC_USER_EMAIL`, and `PUBLIC_USER_DISPLAY_NAME`. The API accesses the
configured database on that user's behalf; the Supabase provider uses `SUPABASE_SECRET_KEY`,
which bypasses RLS, while the Neon provider uses a server-side connection. Anyone who can reach a
deployment can therefore read and write the whole library, so treat the deployment URL itself
as the only thing standing between the data and the public.

## Historical rebuild checkpoints

The numbered stages below describe the rebuild and migration history, not the Stage visual
mode. Some checkpoint instructions describe superseded authentication or data arrangements;
consult [Architecture](ARCHITECTURE.md) and [data providers](docs/DATA_PROVIDERS.md) for current
boundaries before using them.

## Stage 2 Staging Setup

After linking the configured Supabase project and applying the migration, configure its URL and keep the service-role key in macOS Keychain. Then create or reset the two password accounts:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co \
  .venv/bin/python scripts/stage2_setup.py
```

Use `--generate` to create strong passwords and store them in Keychain instead of entering them. The live verifier reads those Keychain entries and exercises Auth, FastAPI, and every RLS boundary:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME \
CONCERT_TRACKER_API_URL=https://PREVIEW_URL/api/v1 \
  .venv/bin/python scripts/stage2_verify.py
```

Retrieve a generated password locally when needed without putting it in Git or chat:

```bash
security find-generic-password -a concert-tracker \
  -s "Concert Tracker Password - owner@example.com" -w
```

Replace the email in the service name with Rachel's address for her password.

## Stage 3 Calculation API

The authenticated API now owns ratings and analytics. Run its golden tests with:

```bash
.venv/bin/python -m pytest tests/test_ratings.py tests/test_analytics.py \
  tests/test_calculation_api.py
```

Interactive OpenAPI documentation is available at `/api/v1/docs` in an integrated Vercel
preview. The endpoints calculate from supplied snapshots and do not write concert data.

## Stage 4 Migration Dry Run

The migration command reads copied backups and writes only to an ignored local output folder.
It automatically reruns against its first result and fails if the second pass changes anything.

```bash
.venv/bin/python -m scripts.stage4_migrate \
  --cloud data/backups/stage-2-pre-schema/TIMESTAMP/concert_tracker_concerts.json \
  --browser data/backups/stage-0/TIMESTAMP/browser-localstorage.json \
  --auth-users data/backups/stage-2-pre-schema/TIMESTAMP/auth-users.json \
  --baseline-rankings docs/baseline/cloud-rankings.json \
  --existing data/backups/stage-4-pre-dry-run/TIMESTAMP/normalized.json \
  --rating-rule-version-id UUID \
  --output data/migrations/stage-4/TIMESTAMP
```

The Stage 4 SQL was applied to the empty normalized staging schema at the start of Stage 5. The
dry-run destination is still local-only and the 46 legacy rows remain untouched.

## Stage 5 Cloud Workflows

The React application now reads and writes the empty normalized staging library through FastAPI.
For split local development, run the API and Vite proxy in separate terminals:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME \
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME \
PUBLIC_USER_ID=YOUR_SUPABASE_USER_UUID \
  .venv/bin/uvicorn backend.server:app --port 8001

npm --prefix frontend run dev -- --port 3011
```

The Vite proxy maps `/api` to port `8001`; the application opens straight into the library.
The browser caches the latest library snapshot and queues temporary offline mutations in
IndexedDB. Reconnecting replays each mutation with its idempotency key; stale edits open an
explicit conflict dialog.

Cloud API routes, request shapes, status codes, and CSV behavior are documented in
[`docs/API.md`](docs/API.md).

## Stage 6 Interface And Motion

The mobile dashboard now uses dedicated Concerts and Rankings views, compact paired totals,
a full-width next-concert panel, and collapsed secondary filters. The concert form is grouped
into Event, Attendance, Your review, and Details sections. Motion is loaded lazily, limited to
short state transitions, and disabled or simplified when the operating system requests reduced
motion.

## Stage 7 Local Backup

The Mac LaunchAgent runs at 2:00 AM in the computer's local Toronto timezone and catches up at
login when the last successful backup is at least 24 hours old. Run an immediate backup with:

```bash
.venv/bin/python -m sync.backup --now
```

SQLite is written atomically to `data/concert_tracker.sqlite3`. The latest workbook is
`data/exports/concerts-latest.xlsx`, with 30 dated archives retained under
`data/exports/archive/`. Configuration and the rotating refresh token stay in macOS Application
Support and Keychain, respectively. See [Backup and restore](docs/BACKUP_RESTORE.md) for status,
installation, recovery, and uninstall commands.

## Stage 8 Production Cutover

The reviewed migration loaded 46 concerts, 66 attendees, and 54 separate member reviews into
the normalized cloud schema. Run the conflict-safe verifier with:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co \
  .venv/bin/python -m scripts.stage8_cutover verify \
  --normalized data/migrations/stage-4/TIMESTAMP/normalized.json \
  --output data/migrations/stage-8/TIMESTAMP
```

The live two-user CRUD smoke test is available as `python -m scripts.stage8_verify`; it creates
and then soft-deletes a clearly labelled verification concert. Production and rollback evidence
is recorded in [Stage 8 checkpoint](docs/checkpoints/STAGE_8.md).

## Stage 9 Stabilization

Run the read-only health audit with:

```bash
.venv/bin/python -m scripts.stage9_monitor
```

The same audit runs weekly through the Codex app. Legacy cleanup remains blocked until the full
30-day observation period ends on August 2, 2026 and receives explicit approval. See the
[stabilization runbook](docs/STABILIZATION.md).

## Stage 0 Baseline

```bash
python3 scripts/stage0_baseline.py --browser-json /tmp/ct-browser-local.json
```

Private raw backups are written under ignored `data/`. Safe comparison fixtures are written under `docs/baseline/`.

## Deployment identity

This is a two-person tracker, but no account is hardcoded. Configure your own:

**Front end** — copy `config.example.js` to `config.js` (git-ignored) and fill it in:

```js
window.APP_CONFIG = {
  ownerEmail:   'you@example.com',
  partnerEmail: 'them@example.com',
  ownerName:    'You',
  partnerName:  'Them',
  backupPin:    '1234',   // optional; empty disables the backup-screen gate
};
```

Omit the file entirely and the app still runs — the login form accepts any address
and Supabase Row Level Security rejects accounts that aren't authorised.

**Back end / scripts** — set these in the environment:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_USER_EMAIL` | The owner account |
| `PARTNER_USER_EMAIL` | The second account |
| `PUBLIC_USER_DISPLAY_NAME` | Display name for the owner |

**Database** — the RLS policies in `supabase/migrations/` ship with `owner@example.com`
placeholders. Replace them with your own address before applying to a fresh project,
or the policies will lock everyone out.

> The client-side email list and the backup PIN are conveniences, not security
> boundaries. RLS is what actually restricts access to the data.


## Licence

Released under the [MIT License](LICENSE).
