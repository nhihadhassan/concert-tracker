# Production Stabilization

Stage 9 observes the normalized production application for 30 full days. It does not authorize
automatic cleanup.

## Weekly Audit

Run the read-only audit manually with:

```bash
.venv/bin/python -m scripts.stage9_monitor
```

The active Codex automation `Concert Tracker Stage 9` runs the same audit every Monday at
9:00 AM Toronto time. Reports are written privately under `data/monitoring/stage-9/` and remain
excluded from Git and Vercel.

The audit verifies:

- Production health and unauthenticated rejection.
- Authenticated cloud counts and calculations.
- Backup freshness, counts, and deterministic checksums.
- Read-only SQLite integrity and Excel package integrity.
- The expected Ready Vercel production deployment and seven-day error-log window.
- Supabase database usage against the 70% free-tier warning threshold.
- The elapsed observation period and cleanup date gate.

Vercel's exact monthly invocation, CPU, memory, and egress percentages are not exposed by the
project CLI. Review them in the Vercel Usage dashboard during the weekly audit and record any
approach to 70% as a checkpoint issue.

## Observation Log

| Date | Result | Active data | Supabase DB | Vercel errors | Backup | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-03 | 10/10 pass | 46 concerts, 66 attendees, 54 reviews | 16 MB / 3.2% | None | Fresh, exact checksums | Observation started |

## Cleanup Gate

- Earliest date: August 2, 2026 at 1:45 PM Toronto time.
- Thirty days must pass without an unresolved data-loss or authorization issue.
- Daily backups must remain healthy throughout the period.
- Vercel and Supabase usage must remain below 70% of every free-tier allowance.
- Cleanup still requires explicit approval after the date gate passes.

Until every condition passes, retain:

- `concert_tracker_concerts` and the legacy API/import path.
- Legacy Vercel deployment `dpl_7uutpATLEwiQYJtgYG6UPTFtRGHd`.
- All Stage 0, Stage 4, Stage 7, and Stage 8 rollback exports.
- The normalized migration report and local SQLite/Excel copies.

No cleanup command is automated. A future approved cleanup must begin with fresh JSON, SQLite,
and Excel backups and use a preview deployment before removing any rollback path.
