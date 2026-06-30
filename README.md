# Concert Tracker

A private shared concert tracker for logging, rating, and comparing upcoming and attended shows.

The production app is currently the legacy single-file dashboard. A checkpointed React, FastAPI, and Supabase rebuild is beginning with recoverable baselines and no production changes.

## Documentation

- [Product](PRODUCT.md)
- [Rating rules](RATING_RULES.md)
- [Architecture](ARCHITECTURE.md)
- [Cost budget](COST_BUDGET.md)
- [Stage 0 checkpoint](docs/checkpoints/STAGE_0.md)
- [Stage 1 checkpoint](docs/checkpoints/STAGE_1.md)
- [Stage 2 checkpoint](docs/checkpoints/STAGE_2.md)
- [Stage 3 API contract](docs/API.md)
- [Stage 3 checkpoint](docs/checkpoints/STAGE_3.md)
- [Migration design](docs/MIGRATION.md)
- [Stage 4 checkpoint](docs/checkpoints/STAGE_4.md)

## Current Stack

- Vanilla HTML, CSS, and JavaScript
- Tailwind via CDN
- Browser `localStorage` with optional Supabase synchronization
- Vercel static hosting

## Local Preview

```bash
python3 -m http.server 4599
```

Then open `http://localhost:4599`.

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

Without staging environment variables, the React application intentionally fails closed on the sign-in screen. Copy `frontend/.env.example` only for local staging work; never add a service-role key to the frontend environment.

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

The committed Stage 4 SQL is pending review and is not applied during the dry run.

## Stage 0 Baseline

```bash
python3 scripts/stage0_baseline.py --browser-json /tmp/ct-browser-local.json
```

Private raw backups are written under ignored `data/`. Safe comparison fixtures are written under `docs/baseline/`.
