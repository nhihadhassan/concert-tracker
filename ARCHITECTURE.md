# Architecture

## Current Production

```text
Browser
  -> index.html (UI, validation, calculations, seed data)
  -> localStorage (local cache and offline outbox)
  -> Supabase Auth and concert_tracker_concerts JSON rows

GitHub main -> Vercel static deployment
```

The browser owns business rules and talks directly to Supabase. PIN access is intentionally local-only. The configured Supabase project was resumed during Stage 0, and an anonymous read confirmed that RLS returns no protected rows.

The Stage 0 authorized export found 46 cloud concerts versus 45 in the fresh browser snapshot. The cloud contains one additional J Cole concert and newer values for two upcoming concerts. Supabase is the migration authority; normalized artist and date will be used to reconcile legacy records because cloud and browser UUIDs do not match.

## Target Architecture

```text
React + TypeScript
  -> FastAPI /api/v1
      -> Python rating and analytics domain
      -> Supabase Postgres with RLS
  -> IndexedDB snapshot and mutation outbox
  -> Supabase Realtime query invalidation

Mac launchd -> Python backup agent -> SQLite + XLSX
```

## Authority Boundaries

- Supabase is authoritative after migration.
- FastAPI owns validation, calculations, analytics, and writes.
- React renders server results and does not reproduce rating formulas.
- IndexedDB supports temporary offline operation, not an independent source of truth.
- SQLite and Excel are read-only recovery copies.

## Planned Tables

- `app_members`
- `concerts`
- `concert_attendees`
- `concert_reviews`
- `rating_rule_versions`

Production schema work begins only after the Stage 1 preview shell and Stage 2 staging checkpoint are approved.
