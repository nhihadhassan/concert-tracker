# Stage 6 Checkpoint

Captured: 2026-07-01

## Completed

- Tightened the mobile header while preserving theme, export, add, and sign-out actions.
- Placed total concerts and total spending side by side, with next concert full-width beneath.
- Added dedicated Concerts and Rankings mobile views.
- Kept search visible and collapsed status, genre, and sort into an accessible filter control.
- Organized the form into Event, Attendance, Your review, and Details navigation sections.
- Added short card, rating, artwork, ranked-row, modal, count, sync, and save-feedback motion.
- Added an attended-state celebration without confetti or persistent effects.
- Added complete MotionConfig and CSS reduced-motion handling.
- Lazy-loaded Motion's DOM feature bundle and added focused interaction tests.

## Live RLS Fix

Live cleanup found that PostgreSQL rejected the API's soft delete because the updated row no
longer matched the active-row select policy. Added and applied
`20260701110000_stage6_soft_delete_rls.sql`, which gives authenticated app members select
visibility to deleted normalized rows while FastAPI continues to query only active rows.

- Create: passed against normalized staging.
- Soft delete before policy: correctly exposed HTTP `403` during checkpoint testing.
- Soft delete after policy: passed through the public API and RLS.
- Normalized active concerts after cleanup: 0.
- Legacy `concert_tracker_concerts`: unchanged at 46.
- Soft-delete policies present: 3.

## Visual Verification

- Desktop layout: no overlap; three-card grid and sticky ranked sidebar preserved.
- Mobile width: 390 CSS px with document scroll width exactly 390 px.
- Mobile header height: 115 px.
- Paired total panels: 176 px each; next-concert panel: 362 px full width.
- First test concert card began at 539.5 px, within the initial 844 px viewport.
- Rankings switch hid the concert dashboard and exposed a 362 px dedicated ranking panel.
- Filter toggle exposed every secondary control and accurately reported expanded state.
- Form section navigator displayed all four destinations in a stable two-by-two mobile grid.
- Browser console warnings/errors: 0.

Checkpoint captures:

- `docs/checkpoints/stage-6/desktop.png`
- `docs/checkpoints/stage-6/mobile-concerts.png`
- `docs/checkpoints/stage-6/mobile-rankings.png`
- `docs/checkpoints/stage-6/mobile-form.png`

The current staging response has no chart series, so Stage 6 does not invent a decorative chart.
Ranked rows use the coordinated reveal and layout-reordering treatment; chart reveals remain
reserved for a future server-backed chart surface.

## Verification

- `npm run check`: pass; 6 frontend tests and 44 backend/domain/API/migration tests.
- `npm run build`: pass; 563.10 kB JavaScript, 165.73 kB gzip.
- Build warning: the combined React, Supabase, TanStack Query, and Motion entry chunk remains above
  Vite's advisory 500 kB threshold. Runtime behavior and free-tier use are unaffected.
- Preview health: HTTP `200`, version `0.3.0`, `data_mode: staging`.
- Preview library without Auth: HTTP `401`.
- Preview library with Auth: HTTP `200`, 2 members, 0 normalized concerts.
- Vercel error-log scan: no errors found.

## Preview

- URL: https://concert-tracker-k4ucumnw0-nhihadhassan-2432s-projects.vercel.app
- Deployment: `dpl_5Y1F7dMPQyhDmUFhv8gGS2PJDVai`
- Target: preview only.
- Status: Ready.
- Backend function bundle: 24.26 MB.
- Production URL: unchanged legacy application, deployment
  `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd` from June 24.

## Cost And Rollback

- No paid API, animation service, domain, monitor, storage product, or background worker was added.
- Motion is a local open-source dependency and creates no recurring cost.
- Roll back the preview to Stage 5 deployment `dpl_3cE9gsXNLV1Ntx4V5JqEct22kRNA`.
- Revert the Stage 6 commit to remove the responsive and motion changes.
- The member-only deleted-row policies can remain safely in place because they fix the existing
  API soft-delete contract. Remove them only if soft deletion is replaced and a schema rollback
  is explicitly approved.
- The production legacy deployment and 46-row source table remain available throughout rollback.

## Checkpoint Result

**PASS - awaiting approval before Stage 7.**

Stage 7 must not begin until this checkpoint passes and is explicitly approved.
