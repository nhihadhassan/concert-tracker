# Stage 2 Checkpoint

Captured: 2026-06-30

## Completed

- Added password authentication for the existing Nhihad and Rachel Supabase users.
- Disabled public signup while preserving existing sign-in methods.
- Added strict FastAPI verification for JWT signature, issuer, audience, expiry, role, email allowlist, and active database membership.
- Added the normalized `app_members`, `concerts`, `concert_attendees`, `concert_reviews`, and `rating_rule_versions` tables.
- Added audit identities, timestamps, soft deletion, integer row versions, immutable attendee/review identities, and explicit RLS policies.
- Restricted reviews so each member can create and update only their own review.
- Denied anonymous private data access, member administration, and physical browser deletes.
- Seeded rating rule version 1 with 50% enjoyment and equal remaining weight across stage, setlist, and seat.
- Added repeatable local account bootstrap and live Auth/RLS verification scripts.
- Added a password sign-in interface, protected dashboard boundary, sign-out action, loading state, error state, and mobile-safe layout.
- Configured Supabase values for Vercel Preview only. No service-role credential is present in Vercel or the browser.

## Shared Project Exception

The approved plan originally called for a separate staging Supabase project. Supabase Free permits two active projects, and both slots were already in use. The second project contains an active photography application. The user explicitly approved using the existing `rachel-tracker` project instead.

Before the additive migration, a fresh private backup was written to `data/backups/stage-2-pre-schema/20260630T143124Z/`. It contains the REST schema, all 46 legacy concert rows, non-secret Auth user metadata, checksums, and a manifest.

The migration dry run identified only `20260630180000_stage2_shared_schema.sql`. Existing Supabase migration history was fetched into a temporary workspace and preserved. The legacy `concert_tracker_concerts` table still contains 46 rows, and existing Expense Tracker tables were not changed.

## Verification

- `npm run check`: pass; 3 frontend tests and 12 backend/schema tests.
- `npm run build`: pass; zero dependency vulnerabilities reported by npm audit.
- Live Auth: Nhihad password sign-in pass; Rachel password sign-in pass.
- Live RLS verifier: pass for both members, anonymous access, shared concert writes, separate reviews, blocked cross-review updates, blocked member administration, and blocked physical deletes.
- Invalid/expired/unlisted tokens: rejected by unit and live API checks.
- Public signup: disabled and verified through the hosted Auth settings endpoint.
- Database counts after verification: 46 legacy concerts, 2 members, 1 rating rule, and 0 normalized concerts/attendees/reviews.
- Legacy row count before and after migration: 46.
- Browser desktop sign-in: no overflow or console errors at 1280px.
- Browser mobile sign-in: previously verified at 390px with no horizontal overflow; the same responsive component is covered by the Stage 2 build.
- Protected preview health: HTTP `200`, `data_mode: staging`.
- Protected preview session without JWT: HTTP `401`.
- Protected preview session for Nhihad: HTTP `200`.
- Protected preview session for Rachel: HTTP `200`.

## Preview

- URL: https://concert-tracker-3qs4qiyyx-nhihadhassan-2432s-projects.vercel.app
- Deployment: `dpl_DNCMR1XmFbZMJuhPA87GfEEABXkF`
- Target: preview only
- Protection: Vercel authentication remains enabled
- Production URL: unchanged legacy application

The first Stage 2 preview exposed a Python import-root mismatch and returned `FUNCTION_INVOCATION_FAILED`. The root `api.py` entrypoint fixed the service package boundary. The replacement preview returns healthy API responses.

## Credentials

- Generated passwords are stored only in macOS Keychain under `Concert Tracker Password - <email>`.
- The Supabase service-role key remains only in its existing macOS Keychain entry.
- Vercel Preview contains the Supabase URL, publishable key, and two-email allowlist only.
- Production Vercel has no Stage 2 environment variables.

## Known Limits

- The normalized concert library is intentionally empty until the Stage 4 migration dry run.
- The dashboard continues to show Stage 1 fixtures after authentication; cloud CRUD begins in Stage 5.
- The Supabase project is shared with the legacy Concert Tracker and Expense Tracker, so all future migrations require the same additive-only review and fresh backup process.
- The local system virtualenv uses Python 3.9, while Vercel runs Python 3.12. Both are covered by the test and deployment checks.

## Rollback

- The production Vercel deployment was not changed.
- The preview can be deleted without affecting production.
- Stage 2 tables are empty except for two membership rows and one rating-rule row, so the additive schema can be dropped in reverse dependency order if rollback is approved.
- Do not repair or rewrite the existing shared Supabase migration history.
- The private pre-schema backup is the recovery reference for legacy rows and Auth identities.

## Checkpoint Result

**PASS - awaiting approval before Stage 3.**

Stage 3 must not begin until this checkpoint is explicitly approved.
