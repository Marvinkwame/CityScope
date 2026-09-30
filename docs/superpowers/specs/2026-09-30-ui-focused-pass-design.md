# UI Focused Pass — Design

**Date:** 2026-09-30
**Status:** Approved, ready for planning
**Branches:** `ui/colour-roles` → `ui/results-panel` → `ui/welcome`, merged in that order

## Problem

The app chrome (navbar, sidebar) follows a coherent "cartographer's instrument" design: graphite surfaces, one gold accent, a quiet cyan for live data. Everything else does not, and three problems follow.

1. **The first 10 seconds.** A visitor lands on a dark map and a list of on/off switches, with nothing saying what the app does or what to try. On the live site this is preceded by a cold start (the free-tier API sleeps when idle; measured 8–24 s) during which the map is simply blank. For a portfolio piece, those seconds decide whether a recruiter keeps looking.
2. **The design system stops at the edge of the sidebar.** `theme.ts` defines two accents. Components hard-code at least 14 more, plus a six-colour rainbow heatmap ramp, plus 3-digit greys (`#999`, `#555`, `#ddd`). Two of them are leftovers the previous redesign was meant to remove: `Navbar.tsx` still uses the old lemon gold `rgba(241,196,83)` and `GeoSearch.tsx` the old blue-black `rgba(10,19,29)`. A screenshot of the map mid-analysis, the image a portfolio would actually use, mixes neon cyan isochrones, purple districts, an orange spotlight card, green/orange route pins and Mapbox's default blue search pin.
3. **Every tool presents results differently.** District stats, drawn area, isochrone, spotlight and route each have their own layout. Two use emoji as category icons, which render differently per OS and clash with the aesthetic. `Stat` is duplicated in `DistrictStatsView` and `DrawControls`, route results hand-roll a third copy, and `categoryEmoji` is duplicated in `IsochroneResultsPanel` and `HeatmapSpotlightCard`.

## Goals

- One colour system covering UI, map layers and markers, enforced by a test.
- One set of result components used by every tool.
- A first-run experience that explains the app, offers one-click examples, and turns the cold start into reading time.

## Non-goals

- A new aesthetic, a light theme, or a layout restructure. The chrome is the strongest part of the UI, and the dark map is what makes the data readable.
- Component rendering tests. They need jsdom and Testing Library, new dependencies and a concern of their own. This pass is where their absence is felt, so the gap is named here rather than hidden; they are a good follow-up.
- Storing a selected district in share links (see Phase 3).
- Nearest Amenities, which resumes afterwards and reuses the Phase 2 components.

## Decisions made during design

| Question | Decision | Rejected |
|---|---|---|
| Scope | Focused pass on the three problems | Full redesign; consistency only |
| First run | Welcome card with one-click examples | Sidebar "try this" section (missed on mobile, where the sidebar starts closed); guided tour |
| Colour system | **Three roles** (below) | Two roles, where a cyan heatmap swallows cyan results where they overlap |
| Results layout | **Category bars** | Chips, which hide proportions: 924 and 256 look like the same tag |
| Welcome placement | **Centred, map dimmed** | Floating corner card, easy to ignore, and the blank map stays visible beside it |
| Colour mechanism | **Role tokens in `theme.ts` + guard test** | MUI palette extension (the map can't read the MUI theme → two sources of truth); CSS custom properties (Mapbox paint properties can't resolve `var(--x)`) |

Mockups for the colour system, results panel and welcome card were reviewed in the visual companion and are kept locally in `.superpowers/brainstorm/` (gitignored).

### The three roles

| Role | Token | Means | Used for |
|---|---|---|---|
| **you** | `ROLE.you` = AMBER `#E3B04A` | what the user did | pins, drawn areas, the selected district, active controls, actions |
| **answer** | `ROLE.answer` = CYAN `#56C7BE` | the result of an analysis | isochrone bands, route line, stat highlights, category bars, comparison badge |
| **context** | `ROLE.context` = warm white `#F3EEE4` | the backdrop the answer sits on | heatmap ("city lights"), district lines |

This works because the three analysis tools are mutually exclusive, so the map shows at most one result at a time. What can overlap is a result over context layers, and the roles keep those two visually separate.

---

## Phase 1 — Colour roles (`ui/colour-roles`)

### Tokens (`cityscope/src/theme.ts`)

- `ROLE = { you: AMBER, answer: CYAN, context: '#F3EEE4' }`.
- `HEAT_RAMP`: the Mapbox `heatmap-color` stops, context colour only, rising in opacity — density 0 → `rgba(243,238,228,0)`, 0.2 → 0.12, 0.4 → 0.25, 0.6 → 0.45, 0.8 → 0.65, 1 → 0.85. **The sidebar's heatmap legend renders from the same array**, so the two can no longer disagree (today the sidebar has its own copy of the rainbow).
- A surface token for the 3D building extrusion (replacing `#3E424B` in `MapView`).
- Tinted backgrounds use MUI's `alpha(ROLE.answer, 0.08)` rather than hand-written `rgba(...)`.

The rainbow ramp is dropped on principle, not only for consistency: its luminance peaks at yellow in the middle, so a mid-density area reads as "more" than the red that actually marks the highest density.

### Map layers (`MapView.tsx` only, per the map-isolation rule)

- **Isochrone:** fill `ROLE.answer`, `fill-opacity` interpolated on `contour` from 0.30 at 5 min to 0.08 at 30 min; outline `ROLE.answer` at 0.55. Replaces three neon cyans.
- **Route:** `ROLE.answer`.
- **Heatmap:** `HEAT_RAMP`.
- **Districts:** a 1 px dashed line in `ROLE.context` at 0.3 opacity, and **no visible fill**. The fill layer stays, at `fill-opacity: 0`, because it is the layer `queryRenderedFeatures` uses to make districts clickable. This must be verified in the browser: a click that silently stops registering is exactly the failure to expect here.
- **Selected district:** a new line layer in `ROLE.you`, filtered to the selected feature's id, so the district you clicked is outlined in gold.
- **3D extrusion:** the new surface token.

### Markers

A single `createPin(kind)` helper returns the DOM element for `'origin' | 'a' | 'b' | 'search'`: a gold dot with an ink ring for the isochrone origin, gold with an ink "A"/"B" for route endpoints, a gold ring for the search result. Replaces the default blue Mapbox marker and the green/orange route pins.

### Drawn polygon

mapbox-gl-draw's default style is 7 layer definitions using 2 colours (`#3bb2d0` inactive, `#fbb03b` active), in `@mapbox/mapbox-gl-draw/src/lib/theme.js`. Copy them into `src/constants/drawStyles.ts` with both colours replaced by `ROLE.you`, and pass them as `styles` to `new MapboxDraw(...)`. This was deferred in the original draw feature as risky. With only 7 objects and 2 values to change, the risk is small, but drawing, editing, vertex dragging and "Clear area" must all be re-checked live.

### Chrome strays

The old lemon gold (`Navbar`), the old blue-black (`GeoSearch`), the off-palette golds in `IsochroneControls` (`#C09A28`, `rgba(232,185,58)`), the green/orange A/B in `RouteControls`, the coral "below average" in `DistrictStatsView`, the layer dot colours in `LAYER_CONFIGS`, and the 3-digit greys all move onto tokens. Greys use the theme's text colours (`text.secondary`, `text.disabled`) or `rgba(255,255,255,a)`.

### Guard test (`cityscope/src/colourGuard.test.ts`)

Scans every `.ts`/`.tsx` file under `cityscope/src`, excluding `theme.ts` and test files, and fails listing each offender as `file:line`:

- any hex colour, **3 or 6 digits** (`#999` as well as `#FF7043`), except exactly `#fff`, `#ffffff`, `#000` and `#000000` (case-insensitive);
- any `rgb()`/`rgba()`/`hsl()` other than white or black at some opacity.

White and black at any opacity stay allowed, because they are the idiom for text and surface contrast throughout the app. The test is written **first** and fails against today's code; Phase 1 is complete when it passes.

---

## Phase 2 — Shared results panel (`ui/results-panel`)

### Components (`cityscope/src/components/results/`)

| Unit | Responsibility | Replaces |
|---|---|---|
| `StatRow` | 2–3 values, each with an optional unit and a label | `Stat` in `DistrictStatsView` and `DrawControls`; the hand-rolled stats in `RouteResultsPanel` |
| `CategoryBars` | Top 5 categories: icon, name, count, share of total, a `ROLE.answer` bar scaled to the largest, then "+N more categories" | every chip list |
| `CategoryIcon` | Category → MUI icon, with `Place` as the fallback | both `categoryEmoji` copies |
| `PlaceList` | Clickable rows (name, category, optional meta such as "120 m") that fly the map to the place | the lists in `IsochroneResultsPanel` and `HeatmapSpotlightCard` |
| `ComparisonBadge` | "▲ +142% vs city avg 35/km²" or "▼ −62% vs city avg 35/km²": the arrow carries the direction, and both use `ROLE.answer`, never green or red, because density is neither good nor bad. When there is no meaningful comparison (`densityVsCityPct` is null), it reads "≈ city average" | the coral below-average colour |

Pure helpers, unit-tested:

- `toBars(counts, total, limit = 5)` → `{ rows: [{ category, count, share, barPct }], moreCount }`. `barPct` is relative to the largest category; `share` is relative to `total`.
- `formatCount` (`3,350`), `formatShare` (`28%`), `formatDistance` (`120 m` below 1 km, `1.4 km` above).

**Icons:** restaurant → `Restaurant`, cafe → `LocalCafe`, pub → `SportsBar`, bar → `LocalBar`, supermarket → `LocalGroceryStore`, bakery → `BakeryDining`, park → `Park`, playground → `ChildCare` (Material has no playground glyph; `Toys` renders as a toy car), attraction → `Attractions`, museum → `Museum`, hotel → `Hotel`. All verified present in `@mui/icons-material`.

**Accessibility:** each bar row carries an accessible label such as "Restaurant: 924, 28%", so the chart is never colour-only; icons are `aria-hidden`.

### Adoption

- **District stats** (`DistrictStatsView`): `StatRow` + `ComparisonBadge` + `CategoryBars`. The backend's `/districts/:id/stats` query changes `LIMIT 3` to `LIMIT 5` (`cityscope-backend/src/routes/districts.ts:68`), to match drawn areas.
- **Drawn area** (`DrawControls`): `StatRow` + `CategoryBars`, with "Clear area" styled as a `ROLE.you` action.
- **Isochrone** (`IsochroneResultsPanel`): **the three stacked accordions become a band switcher** (5 | 10 | 15 min, or whichever contours are active) above one `StatRow` + `CategoryBars` + `PlaceList` view for the selected band. It defaults to the outermost band, the question the user actually asked. This is the one deliberate UX change in the pass: the panel gets much shorter, and each band shows its complete picture.
- **Spotlight** (`HeatmapSpotlightCard`): `CategoryBars` + `PlaceList` of the 5 nearest. Nearest Amenities will replace this card later and reuse the same parts.
- **Route** (`RouteResultsPanel`): `StatRow` for distance and duration. The turn-by-turn list is unchanged.

---

## Phase 3 — Welcome card and loading state (`ui/welcome`)

### Examples are data (`cityscope/src/lib/examples.ts`)

Each example is a typed `ShareState`, applied with the existing `applyShareState`. Nothing new holds state.

| Id | Title | Kicker | Icon | State |
|---|---|---|---|---|
| `alexanderplatz-walk` | 15 minutes on foot from Alexanderplatz | Berlin · reachability | `DirectionsWalk` | `berlin`, view (13.4132, 52.5219) z13.8; isochrone, walking, [5, 10, 15], origin (13.4132, 52.5219) |
| `shoreditch-area` | What's inside Shoreditch? | London · drawn-area analysis | `Pentagon` | `london`, view (−0.0785, 51.5247) z15.2; draw polygon `[[-0.0870,51.5265],[-0.0735,51.5285],[-0.0700,51.5230],[-0.0800,51.5205],[-0.0870,51.5265]]` |
| `tokyo-density` | Where Tokyo is busiest | Tokyo · density heatmap | `BlurOn` | `tokyo`, view (139.735, 35.685) z11.3; heatmap layer on |

Default layers (roads and buildings on) apply unless stated. The Shoreditch polygon was checked against production data: 244 POIs in 0.61 km², 398 per km², led by restaurants, cafes, bars and pubs. Kickers deliberately avoid POI counts, which would go stale on the next re-seed.

District statistics has no example because share state cannot hold a selected district. Adding that is possible but is its own change.

### `WelcomeDialog`

Built on MUI `Dialog` for focus trapping, Escape handling and correct dialog semantics.

- **Content:** eyebrow "CITYSCOPE"; headline "See how dense — and how reachable — a city really is."; one line, "Real OpenStreetMap data for 8 cities, analysed live with PostGIS."; the three examples; "Explore on my own →".
- **Shown when** it has not been dismissed in this browser **and** the page did not open from a share link (`#s=` in the URL). Someone following a shared link should land on that link.
- **Dismissed by** choosing an example, "Explore on my own", Escape, or clicking the dimmed backdrop. The dismissal is stored under `localStorage['cityscope.welcomeDismissed']`; every read and write is wrapped in try/catch, so blocked storage (private mode, strict settings) means "show it" rather than a crash.
- **Re-opened** from an "Examples" button in the navbar (`Explore` icon).
- **Mobile:** width `min(92vw, 380px)`, examples stacked; tapping the backdrop dismisses.

### Loading state, driven by the city list request (`useCities`)

- **Loading:** examples disabled; a `ROLE.answer` status line reads "Waking up the analysis server. Free hosting sleeps when idle, so this can take up to 30 s."
- **Error:** "Couldn't reach the server", with a Retry button that refetches.
- **Ready:** the line disappears and the examples become clickable. Readiness requires both the city list and the map instance, since `applyShareState` needs both.
- **Returning visitors** (card dismissed) get a small `ServerStatus` pill with the same states, shown only if loading takes longer than 1.5 s, so a warm server never flashes it.

The card's content needs no server, so it appears before the API answers. That is the point of the design: the cold start becomes time spent reading.

### Risk to verify: cross-city examples

Choosing the Tokyo example while viewing Berlin changes city, and `MapView`'s city-change effect resets every analysis tool. `applyShareState` guards against this with a module-level `hydrating` flag cleared on the next macrotask. That guard was designed for page-load hydration, and here it would depend on React running the city-change effect before that macrotask for a click-triggered update. The expectation is that it does, but a timing assumption is exactly what broke shared-polygon restore before, so this is tested live rather than assumed. If the guard does not hold, it becomes an explicit flag that `MapView` clears itself after its city-change effect runs.

---

## Testing

### Automated (Vitest, pure logic, consistent with the existing suites)

- **Colour guard:** fails before Phase 1, passes after it, and keeps passing.
- **Formatters:** counts, shares, distances either side of 1 km.
- **`toBars`:** top 5, `moreCount`, `share` against the total, `barPct` against the largest, fewer than 5 categories, empty input.
- **Icons:** every one of the 11 categories maps to an icon; an unknown category gets `Place`.
- **Examples:** each round-trips through `encodeState` → `decodeState` unchanged. This matters because the decoder is now strict about tool contents, and a typo in a hand-written example would otherwise be dropped silently at runtime.
- **Welcome memory:** storage that throws falls back to showing the card.

### Verified live in the browser

- Every tool screenshotted before and after each phase.
- District clicks still register with the zero-opacity fill; the selected district is outlined in gold.
- The drawn polygon is gold; drawing, editing, vertex dragging and "Clear area" all work.
- The heatmap and the sidebar legend match.
- The welcome card appears on a first visit, stays gone after a reload, and is skipped when opening a share link.
- All three examples apply completely, including the Tokyo example chosen while viewing Berlin.
- Error state and Retry, by stopping the backend.
- A mobile-width pass.

## Success criteria

- Zero hard-coded colours outside `theme.ts`, enforced by the guard test.
- All five result surfaces use the shared components; no emoji and no duplicated `Stat` or `categoryEmoji` remain.
- On a first visit, the welcome card is visible before the city list has loaded.
- Every example restores completely, including across cities.
- District selection still works.
- Build, lint, and all frontend and backend tests are clean.

## Notes for the implementer

- Strict TypeScript, no `any`; type-only imports use `import type`.
- All Mapbox mutation stays in `MapView.tsx`; UI components write to stores.
- Test files are `*.test.ts`, never `*.test.tsx` — both tsconfigs exclude only `*.test.ts` from the build.
- Commits are granular, one concern each, with **no `Co-Authored-By` trailer**. One branch per phase, merged in order.
- For live checks: if :5173 is free, run the frontend there (backend CORS defaults to that origin). If the owner's server holds :5173, hand browser checks to the owner rather than starting a server on another port, which breaks CORS.
