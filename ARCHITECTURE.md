# Architecture

## Current Production

React/Vite serves the application at `/`; FastAPI serves `/api/v1`. The selected Postgres
provider is authoritative, and IndexedDB supports cached reads and temporary offline writes.
See the data flow and authority boundaries below. The numbered stages document how this
architecture evolved; their descriptions of intermediate states are historical.

### Concerts presentation

Default Stage (`/`, with `/?view=stage` as an alias) and Classic (`/?view=classic`) share the same library and mutation
flows. `frontend/src/App.tsx` retains the lightweight query-string router and lazy-loads
`components/stage/StageConcerts.tsx`. Stage details use the concert ID alone; Classic details add `view=classic`
and render the shared `ConcertDetail`/`ConcertDetailOverlay` with a cinematic presentation.

Stage owns scoped CSS, ticket/poster effects, year selection, and
Replay. Shared motion state comes from `useCinematicMotion`; native artwork transitions are
feature-detected in `lib/stageTransition.ts`. No new API, rating implementation, or persisted
concert model is introduced. Stage is the default. The shared centered header owns the bundled
display-font declaration and navigation back to Stage.

For the design contract, source map, fallbacks, and browser acceptance checks, read
[Stage design guide](docs/STAGE_DESIGN.md). “Stage view” is distinct from the numbered migration
phases below.

## Legacy Architecture (before the rebuild)

```text
Browser
  -> index.html (UI, validation, calculations, seed data)
  -> localStorage (local cache and offline outbox)
  -> Supabase Auth and concert_tracker_concerts JSON rows

GitHub main -> Vercel static deployment
```

The browser owns business rules and talks directly to Supabase. PIN access is intentionally local-only. The configured Supabase project was resumed during Stage 0, and an anonymous read confirmed that RLS returns no protected rows.

The Stage 0 authorized export found 46 cloud concerts versus 45 in the fresh browser snapshot. The cloud contains one additional J Cole concert and newer values for two upcoming concerts. Supabase is the migration authority; normalized artist and date will be used to reconcile legacy records because cloud and browser UUIDs do not match.

## Application Data Flow

```text
React + TypeScript
  -> FastAPI /api/v1
      -> Python rating and analytics domain
      -> DATA_PROVIDER-selected data client (Supabase secret key, RLS bypassed,
         or a direct Neon Postgres connection -- see docs/DATA_PROVIDERS.md)
  -> IndexedDB snapshot and mutation outbox
  -> Interval and focus-based query refresh

Mac launchd -> Python backup agent -> SQLite + XLSX
```

## Stage 1 Foundation

At this checkpoint, Vercel Services mounted the Vite frontend at `/` and the FastAPI service
at `/api`. The only API route was the read-only `/api/v1/health` contract, and React used
in-memory fixtures. Later checkpoints added the current cloud read/write paths.

## Stage 2 Authentication Boundary (removed)

Sign-in described in this section was removed at the owner's request; the section is retained as
the history of how the schema and membership tables came to exist. Stage 2 added password
authentication against the existing `rachel-tracker` Supabase project. The user approved this shared-project exception after both Free-plan project slots were found to be occupied. The browser stores only the Supabase user session and sends its access token to `/api/v1/session`. FastAPI verifies the ES256 signature, issuer, audience, expiry, role, and two-person email allowlist, then confirms active membership through an RLS-protected `app_members` lookup.

The normalized staging schema contains `app_members`, `concerts`, `concert_attendees`, `concert_reviews`, and `rating_rule_versions`. Every table has RLS enabled, audit metadata, soft deletion, and an integer row version. Both members can read the shared library; each member can create and update their own review only. No browser role receives physical delete permission.

The service-role key is used only by local bootstrap and verification scripts. It is never exposed to React, committed to Git, or configured in Vercel.

The legacy `concert_tracker_concerts` table and all `exp_*` tables remain unchanged. Stage 2
added only the five normalized tables, supporting functions, RLS policies, and the rating-rule
seed. Stage 8 made the normalized React/FastAPI application authoritative while retaining the
legacy table and deployment for rollback.

## Stage 3 Calculation Boundary

Stage 3 adds a pure Python domain layer under `backend/domain/`. Rating calculations use
Decimal arithmetic, versioned 60/10/10/10/10 weights, missing-score renormalization,
half-up rounding, a 10-point cap, documented overrides, and explicit rule versions. Reviews can
set an optional manual final rating with a required reason, which takes precedence over the
weighted result. Analytics consume final personal ratings and never recalculate review formulas.

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

Stage 5 connects React to database-backed FastAPI routes. Sign-in was later removed at the
owner's request: the browser sends no credentials, and FastAPI calls PostgREST with the Supabase
secret key. That key bypasses RLS, so row scoping is now application logic against the single
configured public user rather than a database guarantee, and any caller who can reach a
deployment has full read and write access to the library.

TanStack Query owns the cloud snapshot. IndexedDB stores the latest successful snapshot and a
temporary mutation outbox. Queued writes carry UUID idempotency keys, while updates and deletes
carry integer row versions. FastAPI returns HTTP `409` with the current cloud row when a stale
version is detected. The conflict dialog can discard the queued local change or retry it against
the current version; silent last-write-wins behavior is not allowed.

`api_idempotency_keys` records successful responses per member and request key. The concerts,
attendees, and reviews tables also retain the last mutation ID so interrupted create flows can
recover safely. Realtime invalidation needed a signed-in Supabase client, so TanStack Query now
refreshes the library on an interval and on window focus instead.

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

The production browser holds no Supabase credential at all. The Vercel function carries the
secret key and performs every read and write with it, so the RLS policies remain defined in the
schema but no longer constrain production traffic.

The original 46-row JSON table, legacy static deployment, pre/post-cutover JSON exports, and
local SQLite/Excel files remain rollback assets during Stage 9. Soft-deleted verification rows
remain audit history but are excluded from the active concert graph.

## Stage 9 Observation Boundary

Stage 9 adds a read-only local monitor. It authenticates through the same Keychain-backed owner
session as the backup agent, rebuilds the canonical dataset, and compares cloud counts and
checksums with the latest local state. It also opens SQLite read-only, validates the Excel ZIP
package, probes the production health/auth boundary, checks the expected Vercel deployment and
error window, and reads Supabase database size through the linked CLI.

Monitoring reports are private local artifacts. The weekly Codex automation invokes only this
read-only command and is prohibited from deploying, changing cloud data, merging, or deleting
rollback assets. Cleanup has no automatic path and remains gated until thirty elapsed days plus
explicit approval.

## Stage 10 Data Provider Boundary

The `rachel-tracker` Supabase project's free-tier compute began intermittently timing out on
writes (`Warp server error: Thread killed by timeout manager`, confirmed via Supabase's own
logs -- not an application bug), and the project must stay free rather than upgrade. Production
moved to Neon Postgres (provisioned through Vercel's marketplace, so the connection string lives
in the same Vercel dashboard already used for everything else), while keeping Supabase fully
intact as a rollback path.

`backend/supabase_rest.py`'s `get_rest_client()` is the single flip point: it reads
`DATA_PROVIDER` (`supabase`, the default, or `neon`) and constructs the matching client.
`backend/neon_rest.py` implements the identical six-method surface
(`request/select/insert/update/update_count/rpc`) against plain Postgres via `psycopg`, translating
the same small PostgREST filter vocabulary the app already used, so every route module needed zero
changes. `db/neon/schema.sql` is a hand port of the shared Supabase schema with RLS, `auth.users`
foreign keys, and role grants stripped (all already inert in production, since the secret key
bypasses RLS -- see Stage 8) and `auth.uid()`-based actor attribution replaced by the client
filling `created_by`/`updated_by` with the configured `PUBLIC_USER_ID`, matching what `auth.uid()`
already resolved to in practice. `scripts/neon_cutover.py` (adapted from the Stage 8 loader's
checksum/rerun-is-a-no-op discipline) backed up, loaded, and verified full row-by-row parity across
every table before cutover.

Full details, the rollback procedure, and what was kept/dropped/reworked live in
`docs/DATA_PROVIDERS.md`.

## Authority Boundaries

- The database selected by `DATA_PROVIDER` (Neon in production; Supabase remains a configured
  fallback) is authoritative.
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
