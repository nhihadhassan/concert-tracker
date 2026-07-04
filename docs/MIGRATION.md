# Migration Design

## Authority And Identity

- The protected Supabase `concert_tracker_concerts` export is authoritative.
- Browser records match first by legacy source ID and then by normalized artist plus date.
- A matching browser record is reported and skipped, even when its regenerated UUID differs.
- Browser-only identities are imported; cloud values win every conflict.
- Normalized IDs are deterministic UUIDv5 values derived from the legacy source ID.

## Field Conversion

- One legacy JSON object becomes one `concerts` row.
- `ownerEmail` creates the owner's attendee row.
- `rachelAttended` creates Rachel's attendee row.
- Nhihad's component scores become his review.
- `realized` becomes an override only when it differs from the rebuilt calculation or cannot be
  calculated.
- `rachelScore` becomes a documented Rachel legacy override.
- Free-form companion names remain in `concerts.companions`; member attendance remains
  normalized in `concert_attendees`.
- Spotify links, notes, dates, prices, seats, genres, projected ratings, and remote artwork URLs
  are preserved.
- Base64 artwork is decoded, content-addressed by SHA-256, written below the private output
  `storage/concert-artwork/` folder, and replaced with a `storage://` target in the dry-run row.

## Historical Ranking

The Stage 0 cloud ranking fixture supplies `legacy_rank` for the 44 historically rated
concerts. The Python analytics engine uses it only as a tie breaker. Ratings still sort
descending first, so future score changes behave normally while equal historical ratings keep
their approved order.

## Idempotency

- Concert IDs derive from legacy source IDs.
- Review IDs derive from concert and reviewer IDs.
- Attendees use their natural concert/user composite key.
- Artwork object names derive from content hashes.
- The pending database migration adds unique partial indexes for `legacy_source_id` and
  `legacy_rank`.
- The CLI migrates once, migrates again against the first result, and requires identical
  checksums with zero second-run inserts or updates.

## Reports And Safety

`report.json` contains every converted, skipped, and invalid source event; table operations;
review and artwork conversions; analytics verification; and idempotency evidence.
`normalized.json` contains the local destination copy. `manifest.json` records checksums.

All raw rows, reports, extracted artwork, member UUIDs, and local snapshots stay in ignored
`data/` directories. Stage 4 performs read-only Supabase checks and no cloud writes. The SQL
migration is not applied until the reviewed production-cutover stage.
