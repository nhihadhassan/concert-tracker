# Stage 3 API Contract

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
- Yearly, artist, genre, and venue summaries.
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
