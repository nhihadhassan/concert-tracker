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

## Rebuild Rule

The Python rating engine will use the same weights and missing-value behavior, then cap the calculated result at `10.0`.

```text
final_rating = rating_override if present, otherwise calculated_rating
```

An override requires a reason. Each user receives a separate review. The combined rating is the mean of available attendee final ratings, rounded to one decimal and capped at 10.

## Migration Rule

- Preserve every existing `realized` value.
- Store it as an override when it differs from the rebuilt calculation or cannot be reproduced from available components.
- Convert `rachelScore` into a Rachel legacy review override.
- Preserve exceptional component inputs above 10, while capping calculated and combined final ratings.

## Required Fields

All concerts require artist, date, and venue. Attended concerts additionally require price, seat, genre, and a final realized rating.
