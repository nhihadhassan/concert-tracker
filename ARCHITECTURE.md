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

## Stage 1 Foundation

Vercel Services currently mounts the Vite frontend at `/` and the FastAPI service at `/api`. The only API route is the read-only `/api/v1/health` contract. React uses in-memory fixtures and has no Supabase client or write path.

## Stage 2 Authentication Boundary

Stage 2 adds password authentication against the existing `rachel-tracker` Supabase project. The user approved this shared-project exception after both Free-plan project slots were found to be occupied. The browser stores only the Supabase user session and sends its access token to `/api/v1/session`. FastAPI verifies the ES256 signature, issuer, audience, expiry, role, and two-person email allowlist, then confirms active membership through an RLS-protected `app_members` lookup.

The normalized staging schema contains `app_members`, `concerts`, `concert_attendees`, `concert_reviews`, and `rating_rule_versions`. Every table has RLS enabled, audit metadata, soft deletion, and an integer row version. Both members can read the shared library; each member can create and update their own review only. No browser role receives physical delete permission.

The service-role key is used only by local bootstrap and verification scripts. It is never exposed to React, committed to Git, or configured in Vercel.

The legacy `concert_tracker_concerts` table and all `exp_*` tables remain unchanged. Stage 2 added only the five normalized tables, supporting functions, RLS policies, and the rating-rule seed. The production Vercel deployment remains the legacy static app until Stage 8.

## Stage 3 Calculation Boundary

Stage 3 adds a pure Python domain layer under `backend/domain/`. Rating calculations use
Decimal arithmetic, exact `3:1:1:1` relative weights, missing-score renormalization,
half-up rounding, a 10-point cap, documented overrides, and explicit rule versions. Analytics
consume final personal ratings and never recalculate review formulas.

Authenticated FastAPI endpoints expose the current rule, personal and combined ratings,
spending, yearly trends, projection error and bias, grouped summaries, repeat artists, and
rankings. Requests cannot provide custom weights. React remains a display client and does not
contain a parallel rating implementation.

Stage 3 endpoints are calculation-only: callers provide input snapshots and receive derived
results. They do not read or write concerts. Database-backed library reads begin in Stage 5
after the Stage 4 migration dry run.

## Authority Boundaries

- Supabase is authoritative after migration.
- FastAPI owns validation, calculations, analytics, and writes.
- React renders server results and does not reproduce rating formulas.
- IndexedDB supports temporary offline operation, not an independent source of truth.
- SQLite and Excel are read-only recovery copies.

## Normalized Tables

- `app_members`
- `concerts`
- `concert_attendees`
- `concert_reviews`
- `rating_rule_versions`

Production schema work begins only after the Stage 1 preview shell and Stage 2 staging checkpoint are approved.
