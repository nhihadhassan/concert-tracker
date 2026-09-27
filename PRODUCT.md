# Concert Tracker Product

## Register

Encore is a concert journal and dashboard. Stage is the default concert browsing experience; Classic remains available for the same
data entry, comparison, and library workflows.

## Users

Nhihad and Rachel use the tracker on desktop and mobile. Both will share the complete concert library while keeping separate personal reviews and ratings.

## Purpose

Concert Tracker records upcoming, attended, and cancelled shows; preserves music memories; compares anticipated and realized ratings; and keeps a recoverable cloud and local history.

## Current Product

The application uses React and TypeScript, FastAPI domain rules and analytics, normalized
Postgres data, IndexedDB offline support, and local recovery tooling. See
[Architecture](ARCHITECTURE.md) for authority and provider boundaries. The original static
dashboard is a legacy rollback asset, not the current implementation target.

## Approved Concerts Designs

- **Classic (`/?view=classic`)** remains available, with its existing workflows and featured ticket.
- **Stage (`/`, also `/?view=stage`)** is the default: a dominant artist stage, dimensional
  flip ticket, glowing poster archive, moving concert strip, artwork-led detail entrance, changing
  year atmosphere, and personal Replay with optional sound.

The owner selected Stage as the default for the site, logo, and Concerts navigation. Preserve
Classic as an accessible alternative. Both use the same library, filters, details, and editing flows. Stage's feature
contract, visual rules, and future-agent guidance live in [the design guide](docs/STAGE_DESIGN.md).

## Product Principles

1. Preserve data before changing architecture.
2. Keep the current dashboard recognizable and scannable.
3. Put calculations and validation in one tested Python domain layer.
4. Give synchronization states honest, specific labels.
5. Keep routine workflows fast on desktop and mobile.
6. Add motion to communicate state and concert energy, never to delay work.
7. Remain within free infrastructure tiers until usage proves otherwise.
8. Let artwork, typography, and motion create the atmosphere. Keep interface copy short,
   concrete, and useful; omit decorative slogans and explanatory captions.
9. Keep cinematic exploration optional. Preserve native scrolling, a shared motion toggle,
   silent-by-default Replay, and immediate access to ordinary concert workflows.

## Accessibility

Target WCAG AA contrast, visible focus, semantic controls, 44px touch targets where practical, keyboard operation, and complete reduced-motion behavior.
