# API Contract

All routes are mounted below `/api` by Vercel. Calculation routes require a valid Supabase
Bearer token for an active Nhihad or Rachel membership.

## `GET /api/v1/rating-rules/current`

Returns rule version 1, normalized component weights, one-decimal rounding, the 10-point cap,
and missing-score renormalization behavior.

## `POST /api/v1/ratings/calculate`

Accepts up to 20 uniquely identified reviews. Each review may include enjoyment, stage,
setlist, and seat scores plus an optional documented override. The server always selects the
current rule; requests cannot provide custom weights.

The response identifies present and missing components and returns `uncapped_rating`,
`calculated_rating`, `override_rating`, `final_rating`, and `combined_rating` explicitly.

## `POST /api/v1/analytics/calculate`

Accepts up to 5,000 concert snapshots. Each snapshot includes its event fields and zero or
more personal reviews. The response contains:

- The rule and per-concert personal/combined rating results.
- Spending excluding cancelled concerts, attended spend, upcoming commitments, and average
  attended ticket price.
- Combined and per-member rating counts and averages.
- Projection mean absolute error, root mean square error, signed bias, and percentage within
  one point.
- Yearly and monthly trends, artist, genre, and venue summaries, plus the most-attended
  weekday (with Monday-through-Sunday tie resolution).
- Repeat artists and stable personal/combined ranking lists.

Money is rounded to two decimals. Rating averages and projection errors use two decimals;
individual and combined concert ratings use one decimal. Projection bias is
`actual combined rating - projected rating`, so positive values mean the concert beat the
projection.

## Errors

- `401`: missing, invalid, or expired access token.
- `403`: user is not allowlisted or is not an active app member.
- `422`: invalid scores, undocumented overrides, duplicate reviewer IDs, or malformed input.
- `503`: staging Auth or membership configuration is unavailable.

The generated OpenAPI schema at `/api/v1/openapi.json` is the machine-readable source for all
request and response fields.

## Stage 5 Library Routes

All library routes require the same valid member Bearer token. FastAPI passes that token to
PostgREST, so Supabase RLS authorizes every read and write.

### `GET /api/v1/library`

Returns active members, all non-deleted concerts with attendees and separate reviews, and two
server-calculated analytics views. `analytics` remains the full shared library; additive
`personal_analytics` includes records connected to the signed-in member's attendance. Both
analytics objects count attended, upcoming, and cancelled records and include monthly trends,
the most-attended weekday, summaries, spending, projections, and rankings.

### `POST /api/v1/concerts`

Creates a concert, its selected attendees, and the current member's optional review. Requires an
`Idempotency-Key` UUID header. Repeating the same request key returns the original response
without creating duplicates.

### `PATCH /api/v1/concerts/{concert_id}`

Updates event fields. The body requires `expected_row_version`; stale versions return HTTP `409`
with the current cloud row.

### `DELETE /api/v1/concerts/{concert_id}`

Soft-deletes the concert and requires `expected_row_version` as a query parameter. Physical
delete remains unavailable to browser users.

### `PUT /api/v1/concerts/{concert_id}/attendees`

Reconciles selected members and attendance states. The body supplies expected row versions for
existing attendee records.

### `PUT /api/v1/concerts/{concert_id}/review`

Creates or updates only the signed-in member's review. Calculated, override, final, personal, and
combined ratings are returned by the Python domain engine.

### `GET /api/v1/concerts/export.csv`

Returns an authenticated CSV export of the shared normalized library.

Every mutation requires an `Idempotency-Key` UUID. Successful responses are retained per member
and key. In addition to the existing error statuses, library writes may return `404` for missing
rows and `409` for stale row versions.
