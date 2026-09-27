# Encore frontend

React, TypeScript, and Vite, with TanStack Query, IndexedDB, and Motion. The frontend renders
FastAPI results; domain calculations and authoritative writes remain on the server.

## Start locally

From the repository root:

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

Use the URL printed by Vite. Its `/api` proxy targets the separately running backend on port
8001; see the [root README](../README.md) for backend setup. These commands do not start the API.

## Design and routes

Read [agent instructions](../AGENTS.md) and the [Stage design guide](../docs/STAGE_DESIGN.md)
before interface or motion changes.

| Route | Surface |
| --- | --- |
| `/` | Classic Concerts, still the default |
| `/?view=stage` | Alternate cinematic Concerts page |
| `/?concert=<id>` | Classic concert detail |
| `/?concert=<id>&view=stage` | Stage concert detail |
| `/?view=albums` | Album library / Record Room |
| `/?view=stats` | Concert statistics |
| `/?view=wrapped` | Personal concert recap |

`src/App.tsx` owns query-string navigation. Extend its semantic links and history behavior
instead of adding a second router. Stage is lazy-loaded from `src/components/stage/`; the
similarly named `src/components/cinematic/ConcertStage.tsx` belongs to Classic. Shared cinematic
components and the global motion provider live in `src/components/cinematic/`.

Stage effects use CSS and Motion; keep its styles scoped and respect `useCinematicMotion()`.
Bundle fonts and other imported assets through Vite so they use the production `/assets/` route.

## Validate changes

From the repository root:

```bash
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run test:run --prefix frontend
npm run build --prefix frontend
git diff --check
```

These are frontend checks, not a claim that backend tests or a deployment passed. For visual
and interactive changes, also follow the [Stage browser checklist](../docs/STAGE_DESIGN.md#acceptance-checks-for-future-changes)
and check affected Classic, Record Room, or Wrapped behavior. Use fixtures for edge cases and
avoid modifying real records during visual QA. Documentation-only changes need link/path and
diff checks rather than the full application suite.
