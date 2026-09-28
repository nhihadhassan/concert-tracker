# API Contract

All routes are mounted below `/api` by Vercel. No route requires authentication: the API has no
sign-in and serves every caller as the single identity configured by `PUBLIC_USER_ID`.

## `GET /api/v1/rating-rules/current`

Returns rule version 2, normalized component weights (Enjoyment 60%, Stage 10%, Setlist 10%,
Seat 10%, Performance 10%), one-decimal rounding, the 10-point cap,
and missing-score renormalization behavior.

## `POST /api/v1/ratings/calculate`

Accepts up to 20 uniquely identified reviews. Each review may include enjoyment, stage,
setlist, seat, and performance scores plus an optional manual final rating and reason. The server always selects the
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

- `422`: invalid scores, a manual rating without a reason, duplicate reviewer IDs, or malformed input.
- `503`: Supabase configuration is missing or the data service is unreachable.

The generated OpenAPI schema at `/api/v1/openapi.json` is the machine-readable source for all
request and response fields.

## Stage 5 Library Routes

Library routes are unauthenticated. FastAPI calls PostgREST with the Supabase secret key, which
bypasses RLS, and scopes rows to the configured public user in application code.

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

## Album Journal Routes

Album routes are unauthenticated like the rest of the API. Albums and original tracklists are
shared; drafts and published reviews are attributed to the configured public user.

### `GET /api/v1/albums`

Returns the shared album shelf with chronological Spotify tracklists, visible member reviews,
and optional per-track personal ranks, scores, and notes.

### `GET /api/v1/albums/search?q={query}`

Searches Spotify albums by title or artist and returns importable release metadata. Spotify
client credentials remain server-side.

### `POST /api/v1/albums/import`

Imports one Spotify album and its complete tracklist. Requires an `Idempotency-Key` UUID header;
an album already present in the shared shelf is returned without duplication.

### `PUT /api/v1/albums/{album_id}/review`

Creates or updates only the signed-in member's review. The body supports formatted Markdown,
an optional overall score out of 10, draft or published status, and optional personal rank,
score, and short note for each song. Existing reviews require `expected_row_version`; stale
writes return HTTP `409`.
