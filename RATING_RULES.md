# Rating Rules

## Current Data

- `projScore` is the anticipated rating.
- `enjoyment`, `stage`, `setlist`, and `seatScore` are component scores.
- `realized` is the official historical rating and currently remains manually editable.
- `rachelScore` is a legacy single overall score rather than a full review.
- The ranked summary sorts rated concerts from highest `realized` value to lowest.

## Current Weighted Suggestion

The browser suggests a score using:

```text
enjoyment  = 50%
stage      = 16.6667%
setlist    = 16.6667%
seat       = 16.6667%
```

Missing components are omitted and the remaining weights are renormalized. The result is rounded to one decimal. The legacy browser does not cap the suggestion at 10.

## Python Rule Version 1

The Python engine in `backend/domain/ratings.py` is the only calculation authority. It uses
the exact relative weights `3:1:1:1`, which normalize to 50% enjoyment and one sixth each
for stage, setlist, and seat. Decimal arithmetic and `ROUND_HALF_UP` make midpoint rounding
deterministic.

For the set of present component scores `P`:

```text
uncapped = sum(score[i] * weight[i] for i in P) / sum(weight[i] for i in P)
calculated = round_half_up(min(uncapped, 10), 1)
final_rating = rating_override if present, otherwise calculated_rating
combined_rating = mean(available attendee final ratings)
```

The engine also returns the one-decimal uncapped value for transparency. Missing components
are omitted from both sums. A review with no component scores has no calculated rating.

Overrides must be between 0 and 10 and require a non-empty reason. Each user receives a
separate review. The combined rating is rounded half up to one decimal and capped at 10.
Components above 10 remain valid so exceptional historical inputs can be represented, but
calculated, override, final, and combined ratings cannot exceed 10.

### Golden Examples

| Enjoyment | Stage | Setlist | Seat | Calculated |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 7 | 8 | 9 | 8.0 |
| 10 | missing | 8 | 6 | 8.8 |
| missing | 7 | 8 | 9 | 8.0 |
| 11 | 12 | 10 | 9 | 10.0, uncapped 10.7 |

Rule version 1 is returned by every calculation API response. Clients cannot submit custom
weights. A future rule change must create a new documented rule version and retain old rules
for historical reviews.

## Migration Rule

- Preserve every existing `realized` value.
- Store it as an override when it differs from the rebuilt calculation or cannot be reproduced from available components.
- Convert `rachelScore` into a Rachel legacy review override.
- Preserve exceptional component inputs above 10, while capping calculated and combined final ratings.

## Required Fields

All concerts require artist, date, and venue. Attended concerts additionally require price,
seat, genre, and a final realized rating.
