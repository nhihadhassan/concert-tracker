# Data Providers: Supabase and Neon

## Why this exists

The `rachel-tracker` Supabase project (free tier -- confirmed via Supabase's own
`get_organization` API, plan `"free"`) began intermittently failing writes with
`Warp server error: Thread killed by timeout manager` -- PostgREST's own internal request
timeout. Live diagnosis found 32 of these in a 26-minute window, all on the same write, with the
`SELECT`s inside the same request succeeding instantly and no lock contention visible in
`pg_stat_activity`. This is a free-tier compute ceiling, not an application bug, and the project
had to stay free -- so the fix was moving the data layer off Supabase rather than upgrading it.

**The database had to stay reversible.** Supabase's migrations, client, and schema are untouched
by this change, and everything needed to redo the cutover (schema, loader, verification) is
checked in.

## The provider switch

One environment variable controls everything: `DATA_PROVIDER`, read in
`backend/settings.py`. Two values:

- `supabase` (default) -- unset `DATA_PROVIDER`, or set it to `supabase` explicitly. Uses
  `backend/supabase_rest.py`'s `SupabaseRestClient` exactly as it worked before this change.
- `neon` -- uses `backend/neon_rest.py`'s `NeonRestClient`, reading `DATABASE_URL` (a Neon
  connection string).

The flip point is a single function, `get_rest_client()` in `backend/supabase_rest.py`:

```python
def get_rest_client() -> SupabaseRestClient:
    settings = get_settings()
    if settings.data_provider == "neon":
        from backend.neon_rest import NeonRestClient
        return NeonRestClient(settings.database_url, settings.public_user_id)
    return SupabaseRestClient(settings.supabase_url, settings.rest_key)
```

Every route module (`library_routes.py`, `album_routes.py`, `backup_routes.py`,
`spotify_routes.py`) reaches the database exclusively through
`rest: SupabaseRestClient = Depends(get_rest_client)` -- none of them changed for this migration.
`NeonRestClient` implements the identical six-method surface
(`request`/`select`/`insert`/`update`/`update_count`/`rpc`) that `SupabaseRestClient` does, so the
swap is invisible above that dependency.

`sync/cloud.py` (the local backup agent) has its own equivalent switch, `_rest_client()`, driven
by the same `data_provider`/`database_url` fields on its persisted `BackupConfig`.

## Rolling back

1. In Vercel, set `DATA_PROVIDER=supabase` for the environment you're rolling back (or delete the
   variable -- `supabase` is the default) and redeploy.
2. For the local backup agent, re-run `python -m sync.launchd install` with the Supabase flags
   (see `docs/BACKUP_RESTORE.md`).

**Important caveat:** this flips which database is *read from* going forward. It does **not**
retroactively copy anything. Any concert added, edited, or deleted while `DATA_PROVIDER=neon` was
active exists only in Neon -- rolling back to Supabase means the app stops seeing those changes,
it does not merge them in. If you need Supabase to reflect real usage that happened on Neon,
re-run `scripts/neon_cutover.py`'s pattern in the opposite direction (see below) before flipping
back, or reconcile the specific rows by hand for a small number of changes.

Supabase's schema, RLS policies, and `restore_encore_backup` function were never touched --
`supabase/migrations/` is exactly as it was before this migration, so rolling back needs no schema
work, only the env var flip and (if real time has passed) a data reconciliation as above.

## What the Neon schema kept, dropped, and reworked

`db/neon/schema.sql` is a hand port of `supabase/migrations/` (specifically
`20260630180000_stage2_shared_schema.sql`, `20260630190000_stage4_companion_preservation.sql`,
`20260701010000_stage5_functional_cloud.sql`, `20260727113000_album_journal.sql`,
`20260708135214_create_spotify_accounts.sql`, and
`20260818120000_encore_archive_restore_and_setlists.sql` -- the Concert-Tracker-owned subset of a
Supabase project shared with three unrelated apps, which is why this is a fresh file rather than
an edit to `supabase/migrations/`).

**Kept verbatim:** every table, column, `CHECK` constraint, index, the `row_version`
optimistic-concurrency columns, the identity-protection triggers (`protect_attendee_identity`,
`protect_review_identity`, and the album equivalents), and the `restore_encore_backup` function
body.

**Dropped, with justification:** all `auth.users` foreign keys, all Row Level Security policies,
all grants to `anon`/`authenticated`/`service_role`, and all `supabase_realtime` publication
statements. This is not a security reduction -- `ARCHITECTURE.md`'s Stage 8 section already
documents that production's Supabase secret key bypasses RLS entirely (*"the RLS policies remain
defined in the schema but no longer constrain production traffic"*), and Realtime was abandoned
even earlier in favor of interval polling. None of this was doing anything in production before
the migration.

**Reworked:** `set_row_metadata()`'s trigger no longer calls `auth.uid()` (Neon has no `auth`
schema). Querying production directly during planning showed every `concerts.created_by` was
already the single fixed `PUBLIC_USER_ID`, not a real per-user value or NULL -- so `auth.uid()`
was already resolving to (or falling back to) one constant. `NeonRestClient` reproduces this
directly: it fills `created_by`/`updated_by` with the configured `PUBLIC_USER_ID` on insert
(matching the old trigger's `coalesce(new.created_by, auth.uid())`) and always overwrites
`updated_by` on update (matching `coalesce(auth.uid(), new.updated_by, ...)`, where `auth.uid()`
took priority when present). Same observable behavior, no session-variable plumbing needed.

## The PostgREST-filter translation

`backend/neon_rest.py` translates the small PostgREST filter vocabulary this app actually uses
directly to SQL, rather than reaching for an ORM:

- `"col": "eq.value"` -> `WHERE col = %s`
- `"col": "is.null"` / `"is.not.null"` -> `WHERE col IS NULL` / `IS NOT NULL`
- `"order": "col.asc,col2.desc"` -> `ORDER BY col ASC, col2 DESC`
- `"limit": N` -> `LIMIT N`
- `"select": "col1,col2"` (or `"*"`) -> the `SELECT` column list
- `on_conflict` + `Prefer: resolution=merge-duplicates` (used once, in `spotify_routes.py`) ->
  `INSERT ... ON CONFLICT (col) DO UPDATE SET ...`
- a raw `DELETE` (used once, also `spotify_routes.py`) -> `DELETE FROM ... WHERE ...`

Two type-mapping details worth knowing if this needs maintenance:

- **jsonb columns** (`api_idempotency_keys.response_body`) need an explicit
  `psycopg.types.json.Json(...)` wrapper -- psycopg3, unlike psycopg2, has no implicit
  `dict` -> jsonb adaptation. `_adapt_value()` handles this for every insert/update.
- **Return values** are normalized back to plain JSON shapes (`_json_safe_row()`): psycopg hands
  back native `UUID`/`Decimal`/`datetime`/`date` objects, but every pydantic model downstream was
  written against PostgREST's JSON responses, where those columns are always plain strings.
  Without this, e.g. `MemberSummary.user_id: str` fails validation on a raw `UUID` object.

Both of these were real bugs caught by testing against live data during the cutover, not
speculative edge cases -- see the regression tests in `tests/test_neon_rest.py` for the exact
failure each one guards.

## Re-running or re-doing the cutover

`scripts/neon_cutover.py` is the loader, adapted from `scripts/stage8_cutover.py`'s
backup/apply/verify pattern (canonical row normalization for Decimal/timestamp drift, checksum
manifests, insert-only-missing, verify-after-every-run):

```bash
python -m scripts.neon_cutover backup  --output data/backups/neon-cutover/<timestamp>
python -m scripts.neon_cutover apply   --input  data/backups/neon-cutover/<timestamp>
python -m scripts.neon_cutover verify  --input  data/backups/neon-cutover/<timestamp>
```

`backup` reads live Supabase. `apply` and `verify` read the JSON snapshot `backup` wrote, not a
fresh live fetch, so what lands in Neon is exactly what was reviewed. Re-running `apply` against
an already-loaded database inserts nothing further, and `verify` reports zero diff -- this was
proven out live during the actual cutover, not just asserted.

Requires `SUPABASE_URL`, a Supabase key (`SUPABASE_SECRET_KEY` or `SUPABASE_PUBLISHABLE_KEY`),
`PUBLIC_USER_ID`, and `DATABASE_URL` (Neon) in the environment. Use the **direct** (non-pooled)
Neon connection string for `apply`/`verify` bulk loads; the pooled `DATABASE_URL` the app itself
uses works fine for the smaller `backup` reads too, but a direct connection avoids any
transaction-pooling surprises during the bulk insert. `db/neon/schema.sql` must already be applied
to the target database before running `apply` (it's idempotent -- safe to re-run against an
already-provisioned database).

## Provisioning a fresh Neon database

Via Vercel's marketplace integration (what was used here, rather than a standalone Neon account --
same free tier, but the connection string lands directly in Vercel's env vars):

```bash
vercel install neon --name concert-tracker-db --plan free_v3 -e production -e preview
```

(Vercel's free-tier plan slug is `free_v3`, not `free` -- the CLI's own error message names the
available slugs if this changes.) This requires accepting Neon's marketplace terms once in the
browser first; the CLI prints the exact URL if terms aren't yet accepted.

Then apply the schema with the **direct** connection string:

```python
import psycopg
with psycopg.connect(database_url_unpooled) as conn:
    with conn.cursor() as cur:
        cur.execute(open("db/neon/schema.sql").read())
    conn.commit()
```

## Applying schema updates

`db/neon/schema.sql` is the complete schema for a fresh Neon database. For an existing database,
apply each forward-only SQL file in `db/neon/migrations/` in filename order, using
`DATABASE_URL_UNPOOLED`. These migrations keep previously recorded rows intact. Supabase
deployments use the corresponding Encore-only migrations in `supabase/migrations/`; do not use
`supabase db push` for this shared project.
