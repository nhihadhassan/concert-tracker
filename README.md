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

Run the complete Stage 1 quality gate with:

```bash
npm run check
npm run build
```

## Stage 0 Baseline

```bash
python3 scripts/stage0_baseline.py --browser-json /tmp/ct-browser-local.json
```

Private raw backups are written under ignored `data/`. Safe comparison fixtures are written under `docs/baseline/`.
