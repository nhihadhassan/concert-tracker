# Working on Encore

Encore is the user-facing name of Concert Tracker. Read [PRODUCT.md](PRODUCT.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) before changing product behavior.

## Design direction

- For interface or motion work, read [docs/STAGE_DESIGN.md](docs/STAGE_DESIGN.md) first.
  It records the approved Stage design, implementation map, and acceptance checks.
- **Stage is now the default** at `/`, including logo and Concerts navigation. Keep
  `/?view=stage` as a compatible alias and **Classic** accessible at `/?view=classic`.
  The user selected Stage as the default; do not revert that decision or remove Classic.
- Stage should feel like a live show: dominant artwork, oversized condensed type, moving light,
  haze, dimensional tickets, and responsive posters. Preserve that boldness when extending it.
- Keep copy short and factual. Avoid decorative captions, generic inspirational language, and
  explanations of animation techniques in the interface. Let artwork and motion carry the mood.
- Discuss substantial new visual directions before building a preview. Extend the approved
  direction directly when the requested change is already clear.

## Implementation boundaries

- Extend the existing React/Vite, Motion, CSS, and query-string navigation patterns. Stage is a
  lazy-loaded presentation of the same library, not a separate data model or app.
- Preserve native scrolling, semantic links, history/deep links, keyboard focus, mobile touch,
  the shared motion toggle, and operating-system reduced motion. Replay sound is opt-in.
- Keep Stage CSS scoped. Check Stage details in both Classic theme settings; inherited light
  theme rules must not make Stage content unreadable.
- Use real library values and existing artwork helpers. Keep ratings in the Python domain layer;
  never fabricate ratings, attendance, dates, seats, companions, or artist imagery.
- Preserve existing editing, exports, setlists, offline sync, and recovery behavior. Do not alter
  cloud data or migrations to implement presentation changes.
- Verify checkout, branch, remote, and existing changes before editing. Preserve unrelated work.
  Historical `docs/checkpoints/STAGE_*.md` files describe migration phases, not the Stage design.

## Validation and handoff

For frontend behavior changes, run the lint, typecheck, tests, and build commands in
[frontend/README.md](frontend/README.md), then follow the relevant browser checklist in the
Stage guide. Use read-only records for visual QA. Do not describe a preview, local build, pushed
commit, or deployment as interchangeable; report which was actually verified. Documentation-only
changes need link/path and diff checks, not an application deployment.
