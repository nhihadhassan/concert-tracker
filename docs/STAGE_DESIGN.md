# Encore Stage design guide

Stage is the approved default Concerts page, with Classic retained as an alternative. This guide records
the design implemented in September 2026 and the constraints for extending it. Component code
is the authority for exact current values; update this guide when the design intentionally changes.

## Product decision

The user selected Stage as the default after trying both designs. `/`, the logo, and the
Concerts tab open Stage. Keep `/?view=stage` working as a compatible alias and retain Classic
at `/?view=classic`. Both render the same library and use the same concert workflows.

Stage details use `/?concert=<id>`; existing `&view=stage` links also work. Classic details
include `&view=classic`. Closing returns to the originating view. Keep direct loads, browser
back/forward, and modified link clicks working. Stage's canonical is `/`; Classic has its own
canonical and `noindex` metadata. Metadata is not access control.

The numbered **Stage 0–10 migration phases** elsewhere in the documentation are unrelated to
this visual mode. Early standalone HTML concepts are references, not application source.

## The look to preserve

Make the concert artwork, artist name, and light the composition. The opening should feel like
a stage filling the screen, followed by an archive of posters. The user explicitly preferred
bold motion and lighting over a modest rearrangement of ordinary dashboard cards.

| Element | Design rule |
| --- | --- |
| Canvas | Nearly black (`#090a0d`) with locally scoped dark surfaces, even when Classic uses its light theme. |
| Typography | Barlow Condensed Black, weight 900, for Stage display type. Huge artist names, tight line heights, and selective outlined type. Keep existing body and data fonts. |
| Text | Warm cream (`#f5eee7`), readable muted text, visible warm focus rings. Effects stay behind information. |
| Colour | Default hot orange (`#ff7149`); year palettes also use violet, teal, gold, and rose. Poster glow comes from that poster's artwork. |
| Depth | Layer blurred artwork, gradients, haze, light beams, typography, and a cream ticket. Use perspective and restrained spring tilt for depth. |
| Header | Centered Encore wordmark with a simple E symbol; centered navigation beneath. Near-black canvas, cream text, warm active underline, compact actions. The shared header keeps these colours in either app theme. |
| Archive | Large 4:5 posters; three columns on desktop and two on small screens. No decorative numbering. Ratings are standalone condensed numerals (e.g. 10 or 9.7) with a short accent underline and no denominator or badge box. Unrated shows retain a separate status label. |
| Restraint | Concentrate drama in the stage, artwork, and transitions. Keep filters, editing, and navigation predictable. Avoid adding decorative cards, badges, or captions everywhere. |

The current dimensional treatment uses CSS perspective and Motion springs. It does not require
a WebGL engine, video background, canvas renderer, or a second animation library.

## Copy

Use short labels such as **Classic view**, **Replay**, **All years**, **Venue**, and **Seat**.
Write empty states as a fact plus a useful action: “No matching shows.” / “Try another year or
clear a filter.” Missing ticket metadata is “Not added.”

Avoid filler such as “Your unforgettable journey through sound,” “Every moment tells a story,”
or captions explaining that an element is immersive or cinematic. Do not add marketing text to
fill empty space. Artist names and actual show information provide the content.

## Feature contract

| Feature | Required behavior |
| --- | --- |
| Opening stage | Use the existing featured-concert selector and the personal library. Show the next eligible concert, falling back to the latest attended show. Keep huge type, drifting artwork/haze, moving spotlights, and the foreground ticket. Handle an empty library with an Add concert action. |
| Poster hover | Spring tilt, artwork zoom/saturation, blurred colour spill, and one quick light sweep. Keyboard focus also reveals the treatment. Information must not depend on hover; touch remains fully usable. |
| Show entrance | Expand the selected artwork through a shared view transition where supported, then reveal detail layers with a brief warm flare. Reuse the existing details and actions. Unsupported browsers get a working dialog with the normal entrance fallback. |
| Concert strip | Repeat real artists and dates in a continuous ribbon. Pause on hover and keyboard focus. Clicking any visible entry opens its concert. Cloned entries are hidden from accessibility navigation without disabling pointer interaction. |
| Replay | Show the current member's attended shows for the selected year, chronologically. Opening is silent and does not start playback. Provide Play/Pause, previous/next, sound, and close. Keep zero ratings visible. Disable launch when there are no eligible shows. |
| Year atmosphere | Filter posters by year alongside the existing search/status/genre/sort filters. Change the accent and pass a large decorative year behind the artwork. Year also scopes Replay; the hero and ribbon continue using their own library selections. |
| Ticket flip | Follow the pointer slightly; flip to real venue, seat, and attendee/companion values. Permit opening details from either side. The hidden face must not receive keyboard focus. |

Replay uses a quiet synthesized pulse only after explicit sound opt-in. It is not a music
stream, Spotify playback, or a promise of beat detection. Manual navigation must work with
motion disabled. Replay uses personal attendance, not every attended record in the shared library.

## Motion language

Use slow ambient movement and short, decisive interactions. These are the current baseline
values, not a reason to duplicate animation definitions outside the Stage components:

| Motion | Baseline |
| --- | --- |
| Artwork / haze / beams | Approximately 20s / 11s / 12–16s loops, with staggered phases. |
| Floating ticket | 7s loop; flip approximately 0.85s. |
| Pointer tilt | Motion values and springs, stiffness 180 / damping 24; reset on leave or cancel. |
| Poster sweep | One 0.9s sweep on interaction. |
| Concert ribbon | 65s linear loop; pause on hover/focus. |
| Year change | Approximately 1s atmosphere and year passage. |
| Detail entrance | Approximately 0.75s shared artwork transition; 0.65s single flare, with staggered details. |
| Replay | 4.4s per show after Play; approximately 0.45s artwork transition. |

Use transform and opacity where possible. Avoid React state updates for every pointer movement.
Keep light bursts brief and interaction-driven; do not turn the page into a repeating strobe.
Preserve native scrolling and immediate access to controls—no scroll-jacking or entrance gate.

Always use `useCinematicMotion()` for shared pause, hidden-document, and OS reduced-motion state.
Use `useCinematicScene()` for offscreen ambient scenes. The hero pauses offscreen, and Stage
background animation pauses while Replay is open. With motion disabled, ticket flipping, year
selection, concert opening, and manual Replay navigation must still work without animated travel.

## Source map

Paths below are relative to the repository root.

| File | Responsibility |
| --- | --- |
| `frontend/src/App.tsx` | Query-string routes, lazy Stage loading, shared library/filter props, concert opening/closing, history, and focus restoration. |
| `frontend/src/components/stage/StageConcerts.tsx` | Hero, floating/flip ticket, ribbon, year filters, poster archive, and Replay eligibility. |
| `frontend/src/components/stage/StageReplay.tsx` | Native fullscreen dialog, playback/manual navigation, opt-in audio and cleanup. |
| `frontend/src/components/stage/stage.css` | Stage tokens, composition, responsive rules, effects, scoped detail theme, and reduced-motion overrides. |
| `frontend/src/components/stage/stageDate.ts` | Display date-only values without shifting the concert date across time zones. |
| `frontend/src/components/AppHeader.tsx` and `frontend/src/components/AppHeader.css` | Shared centered header, navigation, actions, and bundled display-font declaration. |
| `frontend/src/components/stage/fonts/` | Shared display font and its OFL license. |
| `frontend/src/lib/stageTransition.ts` | Feature-detected native artwork transition and cleanup of temporary transition names. |
| `frontend/src/components/ConcertDetail.tsx` and `ConcertDetailOverlay.tsx` | Shared detail UI with an optional cinematic presentation; preserve Classic defaults. |
| `frontend/src/hooks/useCinematicMotion.ts` | Shared reduced-motion, pause, visibility, and scene state. |
| `frontend/src/components/cinematic/CinematicMotion.tsx` | Shared motion provider and toggle. |
| `frontend/src/lib/cinematic.ts` and `artwork.ts` | Featured-show selection and existing responsive artwork helpers. |
| `frontend/src/lib/metadata.ts` | View titles, canonical URLs, and alternate-view metadata. |
| `frontend/src/App.test.tsx` and `frontend/src/components/stage/StageReplay.test.tsx` | Route, interaction, personal Replay, and audio behavior regression coverage. |

The similarly named `frontend/src/components/cinematic/ConcertStage.tsx` is **Classic's featured concert panel**,
not the alternate Stage page. Record Room and Wrapped also live under `components/cinematic/`;
keep their established behavior when changing the shared motion provider.

## Implementation details that must survive refactors

- Stage content stays lazy-loaded and its CSS stays scoped to `.stage-page`, `.stage-replay`,
  `.concert-detail-overlay-stage`, or the temporary root transition attribute. Preserve the
  scoped detail overrides that defeat Classic light-theme rules.
- Import the display font through the shared header CSS so Vite emits it under `/assets/`. Keep its license.
  Arbitrary `/fonts/` files are rejected by the current Vercel route allowlist; a local font load
  alone does not prove a production load works.
- Use `resizeArtwork` / `artworkSrcSet`, lazy-load archive imagery, and retain missing-image
  fallbacks. Do not create invented library records to make a composition look populated.
- Ratings are server results. Test missing values with `!= null`, not truthiness, so zero remains
  visible. Do not duplicate rating formulas in presentation code.
- Keep a single active `stage-artwork` transition name and remove temporary names after use.
  Preserve the transition fallback and the guard against opening a stale, asynchronously loaded
  detail after navigation has changed.
- Native dialogs retain Escape/close behavior and restore focus to the opener. Use `inert` on
  inactive ticket faces, but not on the pointer-clickable ribbon clones.
- Keep audio creation/resume behind the sound button; cancel timers and release audio resources
  when Replay closes. Opening the page or Replay must never create audible playback.

## Acceptance checks for future changes

Run the frontend commands in [frontend/README.md](../frontend/README.md). Then browser-check
the changed interactions; a successful build alone cannot establish the look or behavior.

1. Check `/` and `/?view=stage` render Stage; `/?view=classic` renders Classic. Logo and Concerts
   links always return to Stage. Check centered header alignment and its menus on desktop/mobile.
2. At desktop size, verify hero composition, ticket tilt/flip, poster hover/focus, and ribbon
   pause/click behavior, including the repeated portion of the strip.
3. Open a show from a poster, the ticket, and the ribbon. Check close, Escape, focus return,
   direct detail URLs, and browser back/forward. Existing details, setlists, and actions remain.
4. Change years with existing filters active. Check counts, empty results, lighting, and personal
   Replay eligibility. Test missing artwork/metadata, long artist names, and a zero rating using
   local fixtures rather than changing real user records.
5. Verify Replay starts paused and silent, manually navigates, plays/pauses, handles its final
   show, and returns focus on close. Check sound opt-in and unavailable-audio feedback.
6. Check 320px and 390px widths: no horizontal overflow, clipped artist names, unreachable
   ticket controls, or hover-only actions. Preserve native touch scrolling.
7. Repeat relevant checks with motion paused, OS reduced motion, and a hidden/background tab.
   Test the transition fallback. Controls and content remain usable.
8. Check Stage and its detail overlay with Classic set to both light and dark. Inspect console
   errors and image/font requests. After a requested release, verify the canonical live Stage
   URL and font response separately from local checks.

Report verification as performed, not as a permanent claim that a past test count or deployment
is still current. Documentation-only work does not require rerunning animation QA or deploying.
