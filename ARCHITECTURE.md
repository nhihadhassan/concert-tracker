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

The legacy `concert_tracker_concerts` table and all `exp_*` tables remain unchanged. Stage 2
added only the five normalized tables, supporting functions, RLS policies, and the rating-rule
seed. Stage 8 made the normalized React/FastAPI application authoritative while retaining the
legacy table and deployment for rollback.

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

## Stage 4 Migration Boundary

Stage 4 adds a deterministic local migration domain and CLI. The transformer treats the legacy
Supabase JSON table as authoritative, reconciles browser records by source ID and normalized
artist/date, and emits normalized concerts, attendees, reviews, and artwork manifests. UUIDv5
identities and a unique legacy source index make reruns safe.

Historical realized scores become documented overrides only when the Python calculation cannot
reproduce them. Rachel's legacy scores become separate Rachel overrides. Explicit legacy rank
values preserve the approved tie order instead of depending on database row order.

The Stage 4 schema migration adds `companions` and `legacy_rank` to `concerts`, plus unique
partial indexes for source and rank identities. Dry-run output and copied staging snapshots
remain private under ignored `data/` paths.

The Stage 4 companion-preservation migration was applied at the start of Stage 5 so the empty
normalized staging tables match the approved destination contract. The 46-row legacy table was
not migrated or modified.

## Stage 5 Cloud Application Boundary

Stage 5 connects React to authenticated, database-backed FastAPI routes. The browser sends the
member's Supabase access token to `/api/v1`; FastAPI validates the session, then uses that same
token for PostgREST calls so every database operation remains subject to RLS. Service-role
credentials are not used by the deployed application.

TanStack Query owns the cloud snapshot. IndexedDB stores the latest successful snapshot and a
temporary mutation outbox. Queued writes carry UUID idempotency keys, while updates and deletes
carry integer row versions. FastAPI returns HTTP `409` with the current cloud row when a stale
version is detected. The conflict dialog can discard the queued local change or retry it against
the current version; silent last-write-wins behavior is not allowed.

`api_idempotency_keys` records successful responses per member and request key. The concerts,
attendees, and reviews tables also retain the last mutation ID so interrupted create flows can
recover safely. Supabase Realtime is used only to invalidate affected TanStack Query data; it is
not a second write path.

CSV exports and all personal and combined ratings remain FastAPI responses. React renders the
returned results and contains no rating formula.

## Stage 6 Presentation Boundary

Stage 6 keeps responsive presentation and motion entirely in React and CSS. The open-source
`motion` package is lazy-loaded with DOM animation features only. It coordinates card entry,
rating changes, ranked-row layout changes, dialog transitions, artwork crossfades, count updates,
sync feedback, and save notices. `MotionConfig` follows the user's reduced-motion preference,
and CSS removes residual transitions and transforms under `prefers-reduced-motion`.

Mobile presentation switches between Concerts and Rankings without changing cloud state. Search
remains visible while status, genre, and sorting controls collapse behind one filter button. The
normalized staging API remains the source for every rendered value; presentation code contains
no ratings, analytics, or synchronization rules.

Soft delete requires an authenticated member to retain RLS visibility of the resulting deleted
row while PostgreSQL checks the update. Stage 6 adds member-only deleted-row select policies for
concerts, attendees, and reviews. FastAPI library queries continue to request
`deleted_at=is.null`, so deleted records never return in the application snapshot.

## Stage 7 Local Recovery Boundary

Stage 7 adds a Mac-only Python backup process under `sync/`. It authenticates as Nhihad with a
Supabase refresh token stored in Keychain, falling back to the existing Keychain password only
when the refresh token is missing or expired. Access tokens remain in memory. The agent invokes
the same `build_library` Python path as FastAPI, so ratings, combined rankings, and analytics are
not reimplemented in the backup layer.

One canonical flattened snapshot feeds the SQLite and Excel writers. Each table receives a
deterministic SHA-256 checksum. SQLite is built and integrity-checked in a same-directory
temporary file before `os.replace`; Excel and dated archives use the same atomic-copy pattern.
Interrupted runs therefore leave the previous recovery copies in place.

Python orchestrates the backup. The required local artifact runtime renders the six-sheet Excel
workbook from a private JSON handoff and reopens the saved `.xlsx` for visual and formula-error
verification during checkpoint runs. The workbook runtime, LaunchAgent, configuration, refresh
token, logs, SQLite database, and Excel exports remain local and are excluded from Git and
Vercel.

`com.nhihad.concert-tracker-backup` runs at 2:00 AM through launchd. `RunAtLoad` invokes a
24-hour freshness check at login, so a sleeping or powered-off Mac catches up without creating
duplicate hourly backups. The cloud remains authoritative; SQLite and Excel never write back.

## Stage 8 Production Boundary

Stage 8 reconciles the full shared Supabase migration history before applying new SQL. The
cutover loader uses the local service-role credential only, refuses conflicting deterministic
IDs or unexpected active rows, inserts only missing rows in dependency order, and verifies the
complete destination after every run. Repeating the loader performs zero writes.

The production browser receives only the Supabase publishable key. FastAPI validates each
member access token and forwards it to PostgREST, so production reads and writes remain governed
by RLS. The Vercel function has no service-role credential.

The original 46-row JSON table, legacy static deployment, pre/post-cutover JSON exports, and
local SQLite/Excel files remain rollback assets during Stage 9. Soft-deleted verification rows
remain audit history but are excluded from the active concert graph.

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
- `api_idempotency_keys`

Production currently serves the normalized architecture. Legacy cleanup requires the complete
Stage 9 observation checkpoint and explicit approval.
