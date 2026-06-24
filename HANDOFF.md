# Concert Tracker — Project Handoff

A living reference so any session (desktop, phone, or cloud) can pick up where the last one left off.

## What it is

**"Nhihad's Concerts"** — a personal concert tracker. Single-file web app (`index.html`):
vanilla HTML + Tailwind (CDN) + JS, backed by Supabase for cloud sync and auth. Built from a
Google Form + an xlsx of 45 real concerts (2016 → 2026).

## Key links

- **Live app:** https://concert-tracker-sepia.vercel.app
- **GitHub (source of truth, private):** https://github.com/nhihadhassan/concert-tracker — default branch `main`
- **Supabase project:** `rachel-tracker` — ref `zgafubhzhxikuknihmnu`, region `ca-central-1`
  - API URL: `https://zgafubhzhxikuknihmnu.supabase.co`
  - Publishable (anon) key, client-safe: `sb_publishable_HMICK42AzL2W_Tpb6VutDQ_HawfnbWM`
  - Table: `public.concert_tracker_concerts` (`id` uuid, `data` jsonb, `updated_at`); realtime enabled

## Architecture

- **Data:** each concert is one row (`id` + `data` JSONB). The app keeps `localStorage` as an
  offline cache; the cloud is the source of truth.
- **Sync:** pull on load + reconcile, per-record upsert/delete on edits, realtime subscription for
  live cross-device updates, and an outbox queue for offline edits. Seed IDs are deterministic
  (no duplicate rows across devices). ~46 concerts in the cloud (45 seed + "J Cole"); 14 have custom art.
- **Auth:** Supabase email magic-link. RLS locks the table so only `owner@example.com` can
  read/write (anon reads return 0 rows — verified). Site URL + redirect URLs are configured
  (the Vercel URL and `http://localhost:4599`).
- **Deploy:** GitHub `main` → Vercel auto-deploy (verified live in ~8s).

## Features

Full 17-question form from the Google Form with conditional-required-by-status validation; stats
(Total concerts / Next concert with artwork / Total spent); sortable "Ranked Summary" sidebar;
prominent color-graded rating badges; per-concert photo picker (iTunes search + paste URL +
upload); CSV export; dark mode; "Saved/Synced" indicator; offline support; favicon. In-app test panel.

Additional iterations: PIN unlock fallback, "Rachel sharing", weighted ratings, art/photo changes,
root Supabase auth redirect.

## Open / pending items

1. **Auth robustness:** a PIN-only unlock can show cached data but can't pull fresh cloud data
   without a real Supabase session (RLS needs the email JWT). Consider switching mobile login to a
   6-digit email code (smoother than magic links in a home-screen app), or wiring the PIN to also
   establish a session.
2. **Optional:** custom domain.

## To continue "from the cloud"

GitHub is the source of truth — clone/pull `nhihadhassan/concert-tracker` to get current code.
Edit `index.html` → commit/push → it auto-deploys. Data is managed by just using the live app
(signed in).

## Local preview

```bash
python3 -m http.server 4599
```

Then open `http://localhost:4599`.
