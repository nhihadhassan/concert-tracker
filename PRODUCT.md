# Concert Tracker Product

## Register

Product dashboard. Design serves repeated data entry, comparison, and browsing.

## Users

Nhihad and Rachel use the tracker on desktop and mobile. Both will share the complete concert library while keeping separate personal reviews and ratings.

## Purpose

Concert Tracker records upcoming, attended, and cancelled shows; preserves music memories; compares anticipated and realized ratings; and keeps a recoverable cloud and local history.

## Current Product

The production application is a single `index.html` file hosted on Vercel. It embeds 45 seed concerts, stores browser changes in `localStorage`, and attempts authenticated synchronization to a Supabase JSON-blob table. A temporary PIN opens local-only mode.

## Target Product

The staged rebuild will use React and TypeScript for the interface, FastAPI for domain rules and analytics, normalized Supabase tables for authoritative data, and a daily Mac backup to SQLite and Excel.

## Product Principles

1. Preserve data before changing architecture.
2. Keep the current dashboard recognizable and scannable.
3. Put calculations and validation in one tested Python domain layer.
4. Give synchronization states honest, specific labels.
5. Keep routine workflows fast on desktop and mobile.
6. Add motion to communicate state and concert energy, never to delay work.
7. Remain within free infrastructure tiers until usage proves otherwise.

## Accessibility

Target WCAG AA contrast, visible focus, semantic controls, 44px touch targets where practical, keyboard operation, and complete reduced-motion behavior.
