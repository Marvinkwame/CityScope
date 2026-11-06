# Everyday Reach Phase 2 (Interface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each city's published Everyday reach data on the map. That means a layer you can switch on that colours every populated block by how many of the chosen needs are within a walking-time limit, plus a panel with the residents headline and its range, a block card, share links and a welcome example.

**Architecture:**
- The browser fetches one precomputed payload per city (Phase 1's `GET /reach`) and holds it as typed-array columns. The headline, the per-need shares and the range are computed in the browser in one pass.
- The map colours each block from the same rule, `metres ≤ minutes × k`, either through per-block feature state or through a Mapbox expression; Task 1 measures both and picks one. The block card takes its minutes and ✓/✗ from the same payload, so the colours, the headline and the card can never disagree.
- A new `reachStore` holds the switch, the time, the needs and the selected block. As everywhere in the app, only `MapView` changes the map; the panel and the cards read stores and TanStack queries.

**Tech Stack:** React 19, TypeScript (strict), MUI 7, Zustand 5, TanStack Query 5, Mapbox GL JS 3.20, Vitest 4 (node environment, pure-logic tests only).

**Spec:** `docs/superpowers/specs/2026-10-17-everyday-reach-design.md`. The sections that matter here are "Phase 2 — Interface", "Documentation" and "Success criteria", plus the Phase 1 "API" section and the "Amendments while building Phase 1" for the payload's shape.

## Before Task 1 (owner)

1. Merge `docs/reach-in-production` into `main`.
2. Branch `reach/interface` from the updated `main`, with this plan as its first commit.
3. Keep your servers running for Tasks 1 and 12 (frontend :5173, backend :3001). Your backend reads production, which has served reach data for all eight cities since 2026-11-06, so no local database is needed.

## Global Constraints

- Strict TypeScript with no `any`, and `import type` for types.
- No colour literals outside `cityscope/src/theme.ts`; `colourGuard.test.ts` enforces it. Plain white and black are allowed.
- All Mapbox source, layer, marker, paint and feature-state changes live in `cityscope/src/components/MapView.tsx`, and map event handlers read stores with `getState()`. Components may only move the camera, as `PlaceList` and `GeoSearch` already do.
- **Never change a filter or a data-driven paint property on the reach source for a selection.** Both make Mapbox reload every tile of the source (`style.setFilter` and `style.setPaintProperty` call `_updateLayer`, which marks the source for reload: `mapbox-gl-unminified.js` lines 67179, 67287 and 67500). Selection uses its own one-block source and feature state.
- New camera moves never pass `essential: true`, so Mapbox honours the reduced-motion setting.
- The time control offers only the stops in `meta.stops`, each of which passed the 80% bar. A city with `meta.passes === false` gets no layer.
- Copy says "estimated residents", never just "population". Cities are never ranked. Example kickers contain no digits (`examples.test.ts`). A share that isn't exactly 0 or 1 never shows as "0%" or "100%".
- Phase 2 leaves the backend and production alone: no backend change and no database write.
- Never start, stop or restart the owner's servers (:5173, :3001), and never run a frontend on another port, because CORS is pinned to :5173. Live checks use the owner's running app.
- Commits are granular, one concern each, staged by explicit path, with **no `Co-Authored-By` trailer**.
- Each task passes `npm test`, `npm run build` and `npm run lint` in `cityscope/` before it is committed. The dev console must stay free of errors and warnings; the app runs in `StrictMode`.

## Facts this plan uses (production and the installed libraries, checked 2026-11-06)

- All eight cities pass all four stops (`meta.stops` is `[5, 10, 15, 20]`). No need is missing anywhere (no 65535 distances), but the code handles both cases.
- **Residents per block:**
  - The busiest blocks are New York 8,920, Sydney 7,705, Paris 6,000, Tokyo 4,810 and London 4,076. The medians run from 234 (Amsterdam) to 2,103 (Paris).
  - So New York's columns will be the tallest, not Paris's as the spec expected.
- **Headlines at 15 minutes, all six needs** (published k; the range is the figure at `kLow` and at `kHigh`):

  | City | Headline | Range |
  |---|---|---|
  | Amsterdam | 74% | 69–75% |
  | Berlin | 67% | 62–72% |
  | London | 69% | 60–73% |
  | Munich | 81% | 78–85% |
  | New York | 73% | 71–78% |
  | Paris | 99% | 99–100% |
  | Sydney | 93% | 90–96% |
  | Tokyo | 81% | 80–89% |

  Paris at 20 minutes is 99.9%.
- **Coverage labels** (`meta.coverage`):

  | City | Label |
  |---|---|
  | Amsterdam, Berlin, Munich | "whole city" |
  | London | "all 33 boroughs" |
  | New York | "the five boroughs" |
  | Paris | "the 20 arrondissements" |
  | Sydney | "33 inner suburbs" |
  | Tokyo | "the 23 wards" |

- **Base rates and the GP check:** each band in `meta.completeness.checks.calibrationBaseline[band]` is `{ insideShare, alwaysInsideAgreement }`. London's checks also hold `londonGpShare: 0.707` and `londonGpPractices: 1142`.
- **The block card (`GET /reach/:cellId`):**
  - It answers `{ cell, residents, metresPerMinute, needs: [{ need, name, category, lng, lat, metres, minutes }] }`, with six rows in need order.
  - A need with no place has every field null except `need`.
  - A `name` can be null; unnamed parks are common.
  - The station row can be a `tram_stop` or a `subway_entrance`.
- **Caching:** `GET /reach` is cached by browsers for a day (`Cache-Control: public, max-age=86400`), while the card is read from the database on every request. After any data reload, a browser can hold yesterday's payload alongside today's card.
- **Mapbox GL 3.20:**
  - `fill-extrusion-color` ignores the alpha of its colour, and `fill-extrusion-opacity` is one value for the whole layer.
  - `fill-color`, `fill-extrusion-color` and `fill-extrusion-height` all accept `['feature-state', …]`.
  - Changing feature state (`sourceCache.setFeatureState`) updates state without reloading tiles.
  - A source's attribution shows only while a layer using it is visible.
- **React 19.2:** unmounting a root while React is committing logs "Attempted to synchronously unmount a root while React was already rendering", and passive-effect cleanups run inside the commit (`react-dom-client.development.js` lines 18425 and 27908).

## Decisions this plan makes where the spec is silent

1. **Not a `LayerId`.** Everyday reach lives in its own `reachStore`, and the share codec's `layers` keeps exactly its four keys.
2. **Exclusivity.** Reach turns off the heatmap and the three tools, and each of them turns reach off. The heatmap and the tools keep coexisting with each other, as they do today.
3. **Conflicting links.** A tool or the heatmap in a link beats `reach`. The spec only names tools, but the app never writes the heatmap and reach together, so a hand-made link with both resolves the same way.
4. **Codec.** An invalid `t` or `n` drops `reach`; an invalid `c` drops only `c`. `n` is de-duplicated and put in display order.
5. **Fetching.** The payload is fetched the first time the switch goes on for a city, never in advance. A 404 stays cached for the session and keeps that city's switch disabled.
6. **Colours.** The three classes are three solid colours (`CYAN` and two darker steps of it). The flat fill fades as a whole layer at `REACH_FILL_OPACITY`, and the 3D columns use the same solid colours. The contrast test judges both the flat and the solid versions.
7. **3D height.** Columns rise 0.1 m per resident in every city, so New York's busiest block reaches about 892 m and Paris's about 600 m.
8. **The within rule.** A place is within T minutes when `metres ≤ T × k`, which is the same as rounding `metres / k` up and comparing it with T. A test sweeps every distance to prove it.
9. **Per-need bars.** They show all six needs at the chosen time, with unselected needs dimmed.
10. **Phones.** The bottom card appears only once the payload has loaded, so it never competes with the waking-server pill.
11. **Clicks.** With reach on, a map click never falls through to roads, buildings or districts, and a click outside every block clears the selection.
12. **Selection.** The 2D outline is two line layers on a one-block source of its own. In 3D, the selected column turns `ROLE.you` through the feature state `selected` (the reach source uses `promoteId: 'h'`). Neither reloads tiles.
13. **Recolouring.** Task 1 chooses between per-block feature state and a data-driven expression, and between recolouring live and on release, from measurements.
14. **The card follows the payload.** Each row's minutes and ✓/✗ come from the payload's metres and `k`, the same numbers the colour uses. Only the place's name, category and position come from the card endpoint. If the endpoint's metres or `k` differ from the payload's, the card says the data has changed since the map loaded.
15. **Chosen needs only.** ✓/✗ marks, lines and pins apply only to the chosen needs. Unchosen rows on the card are dimmed and unmarked.
16. **Category pins.** They are DOM markers that render `CategoryIcon` through `react-dom/client`. They're built in `lib/mapPins.ts` with `createElement` rather than JSX, and their roots are unmounted on the next tick, outside React's commit.
17. **Card names.** The card labels tram stops and metro entrances ("Tram stop", "Metro entrance") with their own icons, and shows a place without a name as "Unnamed park", "Unnamed tram stop" and so on.
18. **District outlines draw above the blocks** (owner, 2026-11-06). The reach fill and columns sit beneath the district layers, a deliberate exception to "context under answers", noted in `layerOrder.ts`.
19. **The 80% bar stays** (owner, 2026-11-06). The method note shows each time's agreement beside what always answering "within" would score, and says the 5-minute figure is the informative one.
20. **Percentages.** A share is shown as a whole percent, except that one between 99.5% and 100% shows one decimal, rounded down (99.9%), and one between 0 and 0.5% shows "<1%". No figure reads "100%" unless it is exact.
21. **Welcome example.** It uses Tokyo (81%, range 80–89%), the spec's default.

## Review Focus

1. **Switching city while the layer is on.** The selection clears, the new city's payload loads, and the old city's card never shows. Test: Task 4, `resetForCityChange clears the selected block but keeps the switch, time and needs`.
2. **A link to a block that isn't in the city's payload** (another city's block, or one that no longer exists after a rebuild). The card request 404s and the selection clears without an error. Test: Task 6, `a 404 for a block is ReachCellNotFoundError`; the card hook clears the selection on that error.
3. **The layer is on for a city with no payload, or one that failed the bar.** The switch is disabled with its caption, the layer turns off, and the map shows no error. Tests: Task 6, the `reachAvailability` cases; Task 8, `switchCaption`.
4. **Data reloaded on the server since the browser fetched the payload.** The card's ✓/✗ still match the block's colour, and the card says the data has changed. Test: Task 9, `follows the payload and flags a card from newer data`.
5. **3D switched with the layer on, or the layer switched off in 3D.** The columns replace the flat fill and keep three distinct colours, and the buildings' 3D layer is hidden while reach is on and comes back when it goes off. Tests: Task 7, `reachLayerVisibility`; Task 3, the solid-colour contrast case.

## File map

**Create:**

| File | Purpose |
|---|---|
| `cityscope/src/lib/reach/model.ts` | Need ids, minutes, and payload and card types (a mirror of the backend's) |
| `cityscope/src/lib/reach/config.ts` | `REACH_RECOLOUR`, `RECOLOUR_ON_RELEASE`, `REACH_EXTRUSION_M_PER_RESIDENT` |
| `cityscope/src/lib/reach/summary.ts` | Typed-array columns, the within rule, the one-pass summary, missing counts per block |
| `cityscope/src/lib/reach/expressions.ts` | The class rule, Mapbox expressions, the legend |
| `cityscope/src/lib/reach/api.ts` | Fetchers, not-found errors, the retry rule, availability |
| `cityscope/src/lib/reach/layerVisibility.ts` | Which reach layers show |
| `cityscope/src/lib/reach/copy.ts` | Panel text and percentages |
| `cityscope/src/lib/reach/card.ts` | Card rows, staleness, the block's centre, link lines |
| `cityscope/src/lib/viewExclusivity.ts` | Turns off views that can't share the map with reach |
| `cityscope/src/lib/cityChange.ts` | The resets that run when the city changes |
| `cityscope/src/lib/flyToPlace.ts` | One shared camera move to a place |
| `cityscope/src/store/reachStore.ts` | Switch, time, needs, selected block |
| `cityscope/src/hooks/useReachPayload.ts`, `useReachCard.ts`, `useReachSummary.ts` | Data hooks |
| `cityscope/src/components/LayerSwitchRow.tsx` | One sidebar switch row, shared by the layers and reach |
| `cityscope/src/components/MapCardSlot.tsx` | The bottom-left card slot, shared by the spotlight and the block card |
| `cityscope/src/components/results/BarRows.tsx` | The bar-row markup, shared by category and need bars |
| `cityscope/src/components/reach/ReachPanel.tsx`, `ReachMethodNote.tsx`, `ReachCard.tsx` | The reach UI |
| `cityscope/src/reachContrast.test.ts` | The contrast guard |

Each lib file gets its tests beside it.

**Modify:**

- **Map and theme:** `theme.ts`, `constants/layerConfig.ts`, `lib/layerOrder.ts` and its test, `components/MapView.tsx`, `lib/mapPins.ts`.
- **Sidebar and tools:** `components/Sidebar.tsx`, `IsochroneControls.tsx`, `RouteControls.tsx`, `DrawControls.tsx`.
- **Cards and results:** `HeatmapSpotlightCard.tsx`, `results/CategoryBars.tsx`, `results/bars.ts`, `results/PlaceList.tsx`, `results/CategoryIcon.tsx`, `results/categoryIcons.ts` and `results/format.ts` with their tests.
- **Share links and welcome card:** `lib/shareCodec.ts` and its test, `lib/shareState.ts`, `hooks/useShareSync.ts`, `lib/examples.ts` and its test, `WelcomeDialog.tsx`, `App.tsx`.
- **Docs:** `README.md`, `CLAUDE.md`, the spec.

---

### Task 1: Measure recolouring speed (controller, no subagent)

The spec's first task. It compares two ways of recolouring and decides whether the map recolours while the time slider moves, or when it is released.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-everyday-reach-design.md` (a new `## Amendments while building Phase 2` section, after the Phase 1 measured results)

- [ ] **Step 1: Check the owner's servers.** Run `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/cities/london/reach`. Expected: `200`. If it fails, ask the owner to start their backend; don't start it.
- [ ] **Step 2: Open the app.** Open `http://localhost:5173` in the built-in browser. `tabs_context` must say the pane is **displayed**: a hidden pane throttles frames and makes the timings meaningless. If it stays hidden, ask the owner to show it.
- [ ] **Step 3: Run the measurement.** Run this with `javascript_tool`. It adds throwaway layers that the page reload in Step 4 removes. The colours are measurement placeholders: the snippet runs in the console and is never committed.
  - **What it measures:** `visible` is the time from the change until Mapbox is idle with the new colours drawn. A data-driven paint change reloads every tile in the workers, so the next frame still shows the old colours, and timing only the next frame would mislead. `longestTask` is the longest main-thread block (≥ 50 ms) the change caused.
  - **Approaches:** **expression** sets a new `fill-color` expression, which reloads the tiles. **state** keeps one expression reading `['feature-state', 'missing']` and writes each block's count with `setFeatureState`.

```js
const storeUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/store/mapStore.ts'));
const { useMapStore } = await import(storeUrl);
const map = useMapStore.getState().map;
const data = await (await fetch('http://localhost:3001/api/cities/london/reach')).json();
const k = data.meta.metresPerMinute;
const NEEDS = ['sm', 'ph', 'dr', 'sc', 'pk', 'st'];
const palette = (missing) => ['step', missing, '#56C7BE', 1, '#2f6d68', 2, '#183836'];
const byExpression = (T) => ['+', ...NEEDS.map((n) => ['case', ['<=', ['get', n], T * k], 0, 1])];
const fromState = ['coalesce', ['feature-state', 'missing'], 0];
const setStates = (T) => {
  for (const f of data.features) {
    let m = 0;
    for (const n of NEEDS) if (f.properties[n] > T * k) m++;
    map.setFeatureState({ source: 'spike', id: f.properties.h }, { missing: m });
  }
};
const idle = () => new Promise((r) => map.once('idle', r));
let longest = 0;
new PerformanceObserver((l) => { for (const e of l.getEntries()) longest = Math.max(longest, e.duration); }).observe({ type: 'longtask' });
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function run(change) {
  const visible = []; longest = 0;
  for (let i = 0; i < 10; i++) { const t0 = performance.now(); change(i % 2 ? 15 : 10); await idle(); visible.push(performance.now() - t0); }
  return { visible: Math.round(median(visible)), longestTask: Math.round(longest) };
}
map.jumpTo({ center: [-0.12, 51.5], zoom: 10.5, pitch: 0, bearing: 0 });
map.addSource('spike', { type: 'geojson', data, promoteId: 'h' });
map.addLayer({ id: 'spike-fill', type: 'fill', source: 'spike', paint: { 'fill-color': palette(byExpression(15)) } });
await idle();
const fillExpression = await run((T) => map.setPaintProperty('spike-fill', 'fill-color', palette(byExpression(T))));
map.setPaintProperty('spike-fill', 'fill-color', palette(fromState)); setStates(15); await idle();
const fillState = await run(setStates);
map.setLayoutProperty('spike-fill', 'visibility', 'none');
map.addLayer({ id: 'spike-3d', type: 'fill-extrusion', source: 'spike', paint: { 'fill-extrusion-color': palette(byExpression(15)), 'fill-extrusion-height': ['*', ['get', 'r'], 0.1] } });
map.jumpTo({ center: [-0.12, 51.5], zoom: 11.5, pitch: 60, bearing: -20 });
await idle();
const columnsExpression = await run((T) => map.setPaintProperty('spike-3d', 'fill-extrusion-color', palette(byExpression(T))));
map.setPaintProperty('spike-3d', 'fill-extrusion-color', palette(fromState)); setStates(15); await idle();
const columnsState = await run(setStates);
({ cells: data.features.length, fillExpression, fillState, columnsExpression, columnsState });
```

- [ ] **Step 4: Clean up.** Reload the page with `navigate` to `http://localhost:5173`, which drops the throwaway layers.
- [ ] **Step 5: Decide.**
  - **Approach:** `REACH_RECOLOUR` is `'feature-state'` if its two `visible` medians add up to no more than the expression's two; otherwise `'expression'`.
  - **Live or on release:** the phone estimate is the chosen approach's desktop `visible` × 4 (Lighthouse's mid-range-phone CPU factor). Set `RECOLOUR_ON_RELEASE = true` if the estimate is above 16.7 ms for the fill or the columns (the spec's "more than a frame on a mid-range phone"), or if the approach recorded any long task; otherwise `false`.
  - If a figure sits within 20% of a threshold, ask the owner for one run under Chrome DevTools' 4× CPU throttle and decide on that.
- [ ] **Step 6: Record it.** Add `## Amendments while building Phase 2` to the spec, with a `### Recolouring` entry: the date, London's block count, the eight figures, the factor, both decisions, and that they set `REACH_RECOLOUR` and `RECOLOUR_ON_RELEASE` in Task 2. Commit:

```bash
git add docs/superpowers/specs/2026-10-17-everyday-reach-design.md
git commit -m "docs: record the everyday reach recolouring measurement"
```

---

### Task 2: Reach model and arithmetic

**Files:**
- Create: `cityscope/src/lib/reach/model.ts`, `model.test.ts`, `summary.ts`, `summary.test.ts`, `config.ts`

**Interfaces:**
- **Produces, `model.ts`:**
  - `type NeedId = 'sm' | 'ph' | 'dr' | 'sc' | 'pk' | 'st'`
  - `type ReachMinutes = 5 | 10 | 15 | 20` and `REACH_MINUTES: readonly ReachMinutes[]`
  - `interface ReachNeedInfo { id: NeedId; label: string; iconCategory: string }`
  - `REACH_NEEDS: readonly ReachNeedInfo[]` in display order. The labels are Supermarket, Pharmacy, Doctor, School, Park, Station, and the icon categories `supermarket`, `pharmacy`, `doctors`, `school`, `park`, `station`.
  - `NEED_IDS: readonly NeedId[]`
  - `isNeedId(v: unknown): v is NeedId` and `isReachMinutes(v: unknown): v is ReachMinutes`
  - `canonicalNeeds(ids: readonly NeedId[]): NeedId[]` (de-duplicated, display order)
  - `pickStop(stops: readonly ReachMinutes[], wanted: ReachMinutes): ReachMinutes | null`
  - `NONE_FOUND_METRES = 65535`
  - The payload types `ReachProperties` (`{ h: string; r: number } & Record<NeedId, number>`), `ReachFeature`, `ReachMeta`, `ReachChecks` and `ReachPayload`, and the card types `CellCardNeed` and `CellCard`. They copy the field names and nullability of `cityscope-backend/src/lib/reachPayload.ts` (`ReachMeta`, `CellCard`), with `agreement: Record<ReachMinutes, number>`, `stops: ReachMinutes[]` and `checks: ReachChecks`. `ReachChecks` is `{ calibrationBaseline?: Partial<Record<ReachMinutes, { insideShare: number; alwaysInsideAgreement: number }>>; londonGpShare?: number; londonGpPractices?: number }`. Add a one-line comment saying to keep them in step with the backend file.
- **Produces, `summary.ts`:**
  - `interface ReachColumns { ids: string[]; residents: Float64Array; total: number; metres: Record<NeedId, Uint16Array> }`
  - `toColumns(features: ReadonlyArray<{ properties: ReachProperties }>): ReachColumns`
  - `isWithin(metres: number, minutes: number, k: number): boolean`, meaning `metres <= minutes * k`
  - `interface ReachSummary { share: number; low: number; high: number; perNeed: Record<NeedId, number> }`
  - `summarise(cols: ReachColumns, needs: readonly NeedId[], minutes: number, k: { k: number; kLow: number; kHigh: number }): ReachSummary`. `share`, `low` and `high` are the residents' share with every selected need within at `k`, `kLow` and `kHigh`. `perNeed` is each of the six at `k`. All shares are 0 when `total` is 0.
  - `missingCounts(cols: ReachColumns, needs: readonly NeedId[], minutes: number, k: number): Uint8Array`, each block's number of chosen needs outside the limit. It is the feature-state input.
- **Produces, `config.ts`:**
  - `REACH_RECOLOUR: 'feature-state' | 'expression'` and `RECOLOUR_ON_RELEASE: boolean`, the values from Task 1, with a comment citing the spec amendment
  - `REACH_EXTRUSION_M_PER_RESIDENT = 0.1`

- [ ] **Step 1: Write the failing tests.**

```ts
// model.test.ts
it('pickStop keeps a passed stop, else falls back to 15, else to the last stop', () => {
  expect(pickStop([5, 10, 15, 20], 10)).toBe(10);
  expect(pickStop([10, 15, 20], 5)).toBe(15);
  expect(pickStop([10, 20], 5)).toBe(20);
  expect(pickStop([], 15)).toBeNull();
});
it('canonicalNeeds removes repeats and uses display order', () => {
  expect(canonicalNeeds(['st', 'sm', 'st', 'pk'])).toEqual(['sm', 'pk', 'st']);
});
it('recognises need ids and minutes', () => {
  expect(isNeedId('ph')).toBe(true); expect(isNeedId('bus')).toBe(false);
  expect(isReachMinutes(20)).toBe(true); expect(isReachMinutes('15')).toBe(false); expect(isReachMinutes(12)).toBe(false);
});

// summary.test.ts. Fixture: A r=100 all six 500 m; B r=300 sm 500, the rest 2000; C r=600 every need 65535.
it('toColumns keeps ids, residents, the total and none-found distances', () => {
  const cols = toColumns(FIXTURE);
  expect(cols.total).toBe(1000);
  expect(cols.ids).toEqual([A.h, B.h, C.h]);
  expect(Array.from(cols.metres.sm)).toEqual([500, 500, 65535]);
});
it('summarise counts residents with every chosen need within the limit', () => {
  const s = summarise(toColumns(FIXTURE), NEED_IDS, 15, { k: 62.5, kLow: 50, kHigh: 70 });
  expect(s.share).toBeCloseTo(0.1);
  expect(s.perNeed.sm).toBeCloseTo(0.4);
  expect(s.perNeed.ph).toBeCloseTo(0.1);
});
it('summarise takes the range at kLow and kHigh', () => {
  // D r=1000, every need 800 m: outside 15 min at k 50 (750 m), inside at 62.5 (937.5 m) and 70 (1050 m).
  const s = summarise(toColumns([...FIXTURE, D]), ['sm'], 15, { k: 62.5, kLow: 50, kHigh: 70 });
  expect([s.low, s.share, s.high].map((x) => Math.round(x * 1000))).toEqual([200, 700, 700]);
});
it('summarise answers 0 for an empty payload', () => {
  expect(summarise(toColumns([]), NEED_IDS, 15, { k: 62.5, kLow: 50, kHigh: 70 }).share).toBe(0);
});
it('missingCounts counts the chosen needs outside the limit, none-found included', () => {
  expect(Array.from(missingCounts(toColumns(FIXTURE), NEED_IDS, 15, 62.5))).toEqual([0, 5, 6]);
});
it('isWithin agrees with rounded-up minutes for every distance and limit', () => {
  const disagreements: string[] = [];
  for (const k of [62.5, 65, 66.5, 68.5, 69, 69.5])
    for (const T of REACH_MINUTES)
      for (let m = 0; m <= 8100; m++) if (isWithin(m, T, k) !== (Math.ceil(m / k) <= T)) disagreements.push(`${k}/${T}/${m}`);
  expect(disagreements).toEqual([]);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/reach`. Expected: FAIL, because the modules don't exist yet.
- [ ] **Step 3: Implement `model.ts`, `summary.ts` and `config.ts`** to the interfaces above. `summarise` makes **one pass** over the blocks: for each block it checks the selected needs against `minutes × k`, `minutes × kLow` and `minutes × kHigh`, and each of the six needs against `minutes × k`. This is the path that has to fit in one frame for London's 15,838 blocks.
- [ ] **Step 4:** Run `npx vitest run src/lib/reach`. Expected: PASS. Then run `npm test`, `npm run build` and `npm run lint`.
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/lib/reach/model.ts cityscope/src/lib/reach/model.test.ts cityscope/src/lib/reach/summary.ts cityscope/src/lib/reach/summary.test.ts cityscope/src/lib/reach/config.ts
git commit -m "feat(web): everyday reach model and one-pass headline arithmetic"
```

---

### Task 3: Class colours, map expressions and the contrast guard

**Files:**
- Modify: `cityscope/src/theme.ts`
- Create: `cityscope/src/lib/reach/expressions.ts`, `expressions.test.ts`, `cityscope/src/reachContrast.test.ts`

**Interfaces:**
- **Consumes:** `NeedId`, `ReachProperties` and `isWithin` (Task 2), and `REACH_EXTRUSION_M_PER_RESIDENT` (Task 2).
- **Produces, `theme.ts`:**
  - `REACH_CLASS = { allMet: CYAN, oneMissing: darken(CYAN, 0.45), twoPlusMissing: darken(CYAN, 0.72) } as const`. These are solid colours (MUI `darken` mixes towards black), because `fill-extrusion-color` ignores alpha. The values are starting points; Step 4 settles them.
  - `REACH_FILL_OPACITY = 0.8`, the flat fill's single layer opacity.
  - `REACH_SELECTION = { line: ROLE.you, casing: INK } as const`
  - A doc comment saying the flat fill draws these colours at `REACH_FILL_OPACITY`, the columns draw them solid, and the contrast test checks both.
- **Produces, `expressions.ts`:**
  - `type ReachClass = 'allMet' | 'oneMissing' | 'twoPlusMissing'`
  - `missingCount(props: ReachProperties, needs: readonly NeedId[], minutes: number, k: number): number`
  - `classOf(missing: number): ReachClass`, where 0 is `allMet`, 1 is `oneMissing`, and 2 or more is `twoPlusMissing`
  - `missingCountExpression(needs, minutes, k): ExpressionSpecification`, the sum of `['case', ['<=', ['get', id], minutes * k], 0, 1]`. With a single need it returns that `case` alone (no `+`).
  - `MISSING_FROM_STATE: ExpressionSpecification = ['coalesce', ['feature-state', 'missing'], 0]`
  - `reachColourExpression(missing: ExpressionSpecification)`, which is `['step', missing, REACH_CLASS.allMet, 1, REACH_CLASS.oneMissing, 2, REACH_CLASS.twoPlusMissing]`
  - `reachExtrusionColourExpression(missing)`, which is `['case', ['boolean', ['feature-state', 'selected'], false], REACH_SELECTION.line, <the step>]`
  - `reachHeightExpression()`, which is `['*', ['get', 'r'], REACH_EXTRUSION_M_PER_RESIDENT]`
  - `reachLegend(needCount: number): ReadonlyArray<{ cls: ReachClass; label: string; colour: string }>`. With two or more needs it gives three rows: "All met", "One missing", "Two or more missing". With one need it gives two: "Met" (`allMet`) and "Not met" (`oneMissing`), which are exactly the colours the step gives when at most one is missing.

- [ ] **Step 1: Write the failing tests.** `expressions.test.ts` holds a small evaluator for the operators these builders use (`get`, `feature-state`, `coalesce`, `boolean`, `case`, `<=`, `+`, `step`, `*`), taking a feature's properties and its state. That way an expression is tested by what it does, not only by its shape.

```ts
it('builds a single-need expression without a sum', () => {
  expect(missingCountExpression(['ph'], 15, 62.5)).toEqual(['case', ['<=', ['get', 'ph'], 937.5], 0, 1]);
});
it('colours every fixture block exactly as classOf(missingCount) does, from properties or from state', () => {
  for (const needs of [NEED_IDS, ['sm', 'st'], ['pk']] as const)
    for (const props of FIXTURE_PROPS) {
      const want = REACH_CLASS[classOf(missingCount(props, needs, 10, 66.5))];
      expect(evaluate(reachColourExpression(missingCountExpression(needs, 10, 66.5)), props, {})).toBe(want);
      expect(evaluate(reachColourExpression(MISSING_FROM_STATE), props, { missing: missingCount(props, needs, 10, 66.5) })).toBe(want);
    }
});
it('draws a column in the you colour only while it is selected', () => {
  const expr = reachExtrusionColourExpression(MISSING_FROM_STATE);
  expect(evaluate(expr, A, { selected: true })).toBe(ROLE.you);
  expect(evaluate(expr, A, {})).toBe(REACH_CLASS.allMet);
});
it('treats a none-found distance as missing', () => {
  expect(missingCount({ ...A, pk: 65535 }, NEED_IDS, 20, 70)).toBe(1);
});
it('labels the legend for one need as met and not met', () => {
  expect(reachLegend(1).map((r) => r.label)).toEqual(['Met', 'Not met']);
  expect(reachLegend(6).map((r) => r.cls)).toEqual(['allMet', 'oneMissing', 'twoPlusMissing']);
});
```

`reachContrast.test.ts` works out WCAG relative luminance and contrast ratios with helpers in the test file. `flat(c)` is `c` at `REACH_FILL_OPACITY` over `SURFACE.land`, straight alpha in 8-bit sRGB; `solid(c)` is `c` itself.

```ts
it('keeps neighbouring classes at least 2:1 apart in the flat fill', () => {
  expect(contrast(flat(REACH_CLASS.allMet), flat(REACH_CLASS.oneMissing))).toBeGreaterThanOrEqual(2);
  expect(contrast(flat(REACH_CLASS.oneMissing), flat(REACH_CLASS.twoPlusMissing))).toBeGreaterThanOrEqual(2);
});
it('keeps neighbouring classes at least 2:1 apart as solid 3D columns', () => {
  expect(contrast(solid(REACH_CLASS.allMet), solid(REACH_CLASS.oneMissing))).toBeGreaterThanOrEqual(2);
  expect(contrast(solid(REACH_CLASS.oneMissing), solid(REACH_CLASS.twoPlusMissing))).toBeGreaterThanOrEqual(2);
});
it('keeps the selection casing at least 3:1 from the strongest class', () => {
  expect(contrast(solid(REACH_SELECTION.casing), flat(REACH_CLASS.allMet))).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/reach/expressions.test.ts src/reachContrast.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the theme tokens and `expressions.ts`.
- [ ] **Step 4: Run the tests.** Expected: PASS. If a contrast assertion fails, adjust only the two `darken` amounts and `REACH_FILL_OPACITY` (between 0.7 and 0.9) until all pass. Keep the final values. Then run `npm test`, `npm run build` and `npm run lint`.
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/theme.ts cityscope/src/lib/reach/expressions.ts cityscope/src/lib/reach/expressions.test.ts cityscope/src/reachContrast.test.ts
git commit -m "feat(web): everyday reach class colours, map expressions and contrast guard"
```

---

### Task 4: The reach store and view exclusivity

**Files:**
- Create: `cityscope/src/store/reachStore.ts`, `reachStore.test.ts`, `cityscope/src/lib/viewExclusivity.ts`, `viewExclusivity.test.ts`, `cityscope/src/lib/cityChange.ts`, `cityChange.test.ts`
- Modify: `cityscope/src/components/IsochroneControls.tsx`, `RouteControls.tsx`, `DrawControls.tsx` (each `handleToggle`), `Sidebar.tsx` (the heatmap switch), `MapView.tsx` (the city-change effect)

**Interfaces:**
- **Consumes:** `NeedId`, `ReachMinutes`, `NEED_IDS` and `canonicalNeeds` (Task 2).
- **Produces, `useReachStore`:** state `{ enabled: boolean; minutes: ReachMinutes; needs: NeedId[]; selectedCell: string | null }`, defaulting to `false`, `15`, `[...NEED_IDS]` and `null`. Actions:
  - `setEnabled(v)`: `false` also clears `selectedCell`.
  - `setMinutes(m)`.
  - `toggleNeed(id)`: never removes the last need, and keeps display order.
  - `setNeeds(ids)`: canonicalises, and ignores an empty list.
  - `selectCell(h: string | null)`.
- **Produces, `viewExclusivity.ts`:**
  - `clearForReach(): void` switches the isochrone, route and draw tools off, sets `layers.heatmap` to false, sets the heatmap's click origin to null, and clears the selected feature.
  - `clearReach(): void` calls `useReachStore.getState().setEnabled(false)`.
- **Produces, `cityChange.ts`:** `resetForCityChange(): void`. It runs the five resets now inline in MapView's city-change effect (lines 470–474) and also calls `useReachStore.getState().selectCell(null)`.

- [ ] **Step 1: Write the failing tests.** Reset every store to its initial state in `beforeEach`, with `useXStore.setState(...)`.

```ts
it('toggleNeed never removes the last need', () => {
  useReachStore.getState().setNeeds(['ph']);
  useReachStore.getState().toggleNeed('ph');
  expect(useReachStore.getState().needs).toEqual(['ph']);
});
it('toggleNeed keeps display order', () => {
  useReachStore.getState().setNeeds(['st']);
  useReachStore.getState().toggleNeed('sm');
  expect(useReachStore.getState().needs).toEqual(['sm', 'st']);
});
it('switching off clears the selected block', () => {
  const s = useReachStore.getState(); s.setEnabled(true); s.selectCell('891f1d48947ffff'); s.setEnabled(false);
  expect(useReachStore.getState().selectedCell).toBeNull();
});
it('clearForReach turns off the heatmap and every tool', () => { /* turn all on, call, expect all off */ });
it('clearReach turns reach off and leaves the heatmap alone', () => { /* … */ });
it('resetForCityChange clears the selected block but keeps the switch, time and needs', () => {
  useReachStore.setState({ enabled: true, minutes: 10, needs: ['pk'], selectedCell: '891f1d48947ffff' });
  resetForCityChange();
  expect(useReachStore.getState()).toMatchObject({ enabled: true, minutes: 10, needs: ['pk'], selectedCell: null });
});
```

- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** the store and the two lib files, then wire them in:
  - Each tool's `handleToggle(checked)` calls `clearReach()` when `checked`, beside the existing calls that switch off the other tools.
  - Sidebar's switch calls `clearReach()` before `toggleLayer('heatmap')` when the heatmap is turning on.
  - MapView's city-change effect calls `resetForCityChange()` in place of its five inline resets.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm test`, `npm run build` and `npm run lint`.
- [ ] **Step 5: Commit** in two parts: first the store, then the exclusivity, the city reset and their wiring.

```bash
git add cityscope/src/store/reachStore.ts cityscope/src/store/reachStore.test.ts
git commit -m "feat(web): everyday reach store"
git add cityscope/src/lib/viewExclusivity.ts cityscope/src/lib/viewExclusivity.test.ts cityscope/src/lib/cityChange.ts cityscope/src/lib/cityChange.test.ts cityscope/src/components/IsochroneControls.tsx cityscope/src/components/RouteControls.tsx cityscope/src/components/DrawControls.tsx cityscope/src/components/Sidebar.tsx cityscope/src/components/MapView.tsx
git commit -m "feat(web): everyday reach and the full-map views switch each other off"
```

---

### Task 5: The `reach` share entry

**Files:**
- Modify: `cityscope/src/lib/shareCodec.ts`, `shareCodec.test.ts`, `shareState.ts`, `cityscope/src/hooks/useShareSync.ts`

**Interfaces:**
- **Consumes:** `NeedId`, `ReachMinutes`, `isNeedId`, `isReachMinutes` and `canonicalNeeds` (Task 2), and `useReachStore` and `clearReach` (Task 4).
- **Produces:**
  - `interface ShareReach { t: ReachMinutes; n: NeedId[]; c?: string }`
  - `ShareState.reach?: ShareReach`
  - `effectiveReach(state: ShareState): ShareReach | undefined`, which is `undefined` when `state.tool` is set or `state.layers.heatmap` is true
  - A private `parseReach(v: unknown): ShareReach | undefined`:
    - `t` must pass `isReachMinutes`;
    - `n` must be a non-empty array whose every item passes `isNeedId`, and it is returned as `canonicalNeeds(n)`;
    - `c` is kept only if it matches `/^89[0-9a-f]{13}$/`, the same test as the backend's `isH3CellId`.
  - `decodeState` adds `...(reach ? { reach } : {})`, so a link without `reach` decodes to exactly the same object as before.

- [ ] **Step 1: Write the failing tests** in `shareCodec.test.ts`:

```ts
it('round-trips a reach entry with a block', () => { /* encode BASE + reach { t: 10, n: ['sm','pk'], c: '891f1d48947ffff' }, decode, toEqual */ });
it('drops reach whose t is not 5, 10, 15 or 20', () => { /* t: 12 and t: '15' → no reach key */ });
it('drops reach whose n is empty, not an array, or holds an unknown need', () => { /* [], 'sm', ['sm','bus'] */ });
it('de-duplicates n and puts it in display order', () => { /* ['st','sm','st'] → ['sm','st'] */ });
it('drops only c when it is not a resolution-9 H3 id', () => {
  for (const c of ['891F1D48947FFFF', '891f1d48947fff', '881f1d48947ffff', 42])
    expect(decode({ ...BASE, reach: { t: 15, n: ['sm'], c } })?.reach).toEqual({ t: 15, n: ['sm'] });
});
it('decodes an old link exactly as before, with no reach key', () => {
  expect(Object.keys(decodeState(encodeState(BASE))!)).not.toContain('reach');
});
it('lets a tool or the heatmap win over reach', () => {
  expect(effectiveReach({ ...BASE, reach: R, tool: ISO })).toBeUndefined();
  expect(effectiveReach({ ...BASE, reach: R, layers: { ...BASE.layers, heatmap: true } })).toBeUndefined();
  expect(effectiveReach({ ...BASE, reach: R })).toEqual(R);
});
```

(`decode` here is a test helper that encodes a raw object and decodes it, since `encodeState` only accepts a valid `ShareState`.)

- [ ] **Step 2:** Run `npx vitest run src/lib/shareCodec.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the codec changes,** then wire the share state:
  - `collectShareState` adds `reach: { t, n, ...(selectedCell ? { c } : {}) }` when `useReachStore.getState().enabled`.
  - `applyShareState` calls `clearReach()` with the other resets. Then, when `effectiveReach(state)` is defined, it calls `setMinutes(t)`, `setNeeds(n)`, `selectCell(c ?? null)` and `setEnabled(true)`.
  - `useShareSync` subscribes to `useReachStore`.
- [ ] **Step 4:** Run the tests. Expected: PASS, with every existing codec test unchanged. Then run `npm test`, `npm run build` and `npm run lint`.
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/lib/shareCodec.ts cityscope/src/lib/shareCodec.test.ts cityscope/src/lib/shareState.ts cityscope/src/hooks/useShareSync.ts
git commit -m "feat(web): share links carry the everyday reach time, needs and block"
```

---

### Task 6: Data hooks and availability

**Files:**
- Create: `cityscope/src/lib/reach/api.ts`, `api.test.ts`, `cityscope/src/hooks/useReachPayload.ts`, `useReachCard.ts`, `useReachSummary.ts`

**Interfaces:**
- **Consumes:** `ReachPayload` and `CellCard` (Task 2), `toColumns` and `summarise` (Task 2), and `useReachStore` (Task 4).
- **Produces, `api.ts`:**
  - `class ReachNotBuiltError extends Error` and `class ReachCellNotFoundError extends Error`
  - `fetchReach(apiBase: string, cityId: string): Promise<ReachPayload>`. It GETs `${apiBase}/api/cities/${cityId}/reach`; a 404 throws `ReachNotBuiltError`, and any other failure throws `Error('Failed to fetch reach: <status>')`.
  - `fetchReachCard(apiBase, cityId, cell): Promise<CellCard>`. It GETs `…/reach/${cell}`; a 404 throws `ReachCellNotFoundError`.
  - `shouldRetry(failureCount: number, error: unknown): boolean`. It returns false for the two not-found errors, and `failureCount < 2` otherwise.
  - `type ReachAvailability = 'off' | 'loading' | 'ready' | 'not-built' | 'not-reliable' | 'error'`
  - `reachAvailability(q: { enabled: boolean; data: ReachPayload | undefined; error: unknown; isFetching: boolean }): ReachAvailability`, checked in this order:
    1. data with `meta.passes` gives `'ready'`, and without it `'not-reliable'`;
    2. a `ReachNotBuiltError` gives `'not-built'`;
    3. any other error gives `'error'` when enabled, else `'off'`;
    4. fetching gives `'loading'`;
    5. anything else gives `'off'`.

    "Not built" and "not reliable" hold even while the switch is off, so the switch can be disabled.
- **Produces, hooks:**
  - `useReachPayload()`: `useQuery({ queryKey: ['reach', cityId], queryFn, enabled: reachOn, staleTime: Infinity, retry: shouldRetry, structuralSharing: false })`. Structural sharing would deep-compare 15,838 features on a refetch. It returns the query plus `availability`.
  - `useReachCard()`: key `['reach-card', cityId, selectedCell]`, enabled when reach is on and a block is selected. An effect calls `selectCell(null)` on a `ReachCellNotFoundError`.
  - `useReachSummary(minutes?: ReachMinutes)`. It memoises `toColumns` on the payload object and `summarise` on the columns, the needs, the minutes (the argument, else the store's) and `k`. It returns `{ meta, columns, summary } | null`.
  - `API_BASE` is read the way `usePois.ts` reads it.

- [ ] **Step 1: Write the failing tests** in `api.test.ts`, with `vi.stubGlobal('fetch', …)` and `vi.unstubAllGlobals()` in `afterEach`:

```ts
it('fetchReach returns the payload on 200', async () => { /* stub 200 json, expect meta.city */ });
it('a 404 for a city is ReachNotBuiltError', async () => { await expect(fetchReach(B, 'atlantis')).rejects.toBeInstanceOf(ReachNotBuiltError); });
it('a 500 is a plain error', async () => { /* rejects, not instanceof ReachNotBuiltError, message has 500 */ });
it('a 404 for a block is ReachCellNotFoundError', async () => { /* fetchReachCard */ });
it('asks for the block under its city', async () => { /* expect fetch called with `${B}/api/cities/berlin/reach/891f1d48947ffff` */ });
it('never retries a not-found answer', () => {
  expect(shouldRetry(0, new ReachNotBuiltError())).toBe(false);
  expect(shouldRetry(0, new ReachCellNotFoundError())).toBe(false);
  expect(shouldRetry(1, new Error())).toBe(true);
  expect(shouldRetry(2, new Error())).toBe(false);
});
it('reachAvailability covers every state', () => {
  expect(reachAvailability({ enabled: false, data: undefined, error: null, isFetching: false })).toBe('off');
  expect(reachAvailability({ enabled: true, data: undefined, error: null, isFetching: true })).toBe('loading');
  expect(reachAvailability({ enabled: true, data: PASSING, error: null, isFetching: false })).toBe('ready');
  expect(reachAvailability({ enabled: false, data: FAILING, error: null, isFetching: false })).toBe('not-reliable');
  expect(reachAvailability({ enabled: false, data: undefined, error: new ReachNotBuiltError(), isFetching: false })).toBe('not-built');
  expect(reachAvailability({ enabled: true, data: undefined, error: new Error('x'), isFetching: false })).toBe('error');
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/reach/api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `api.ts` and the three hooks.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm test`, `npm run build` and `npm run lint`.
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/lib/reach/api.ts cityscope/src/lib/reach/api.test.ts cityscope/src/hooks/useReachPayload.ts cityscope/src/hooks/useReachCard.ts cityscope/src/hooks/useReachSummary.ts
git commit -m "feat(web): fetch everyday reach payloads and block cards"
```

---

### Task 7: The map layer

**Files:**
- Modify: `cityscope/src/constants/layerConfig.ts`, `cityscope/src/lib/layerOrder.ts`, `layerOrder.test.ts`, `cityscope/src/components/MapView.tsx`
- Create: `cityscope/src/lib/reach/layerVisibility.ts`, `layerVisibility.test.ts`

**Interfaces:**
- **Consumes:** the expressions and `REACH_FILL_OPACITY` (Task 3), `missingCounts`, `REACH_RECOLOUR` and `RECOLOUR_ON_RELEASE` (Task 2), `useReachStore` and `resetForCityChange` (Task 4), and `useReachPayload` and `useReachSummary` (Task 6).
- **Produces, `layerConfig.ts`:** `REACH_SOURCE_ID = 'reach-source'`, `REACH_FILL_LAYER_ID = 'reach-fill'`, `REACH_EXTRUSION_LAYER_ID = 'reach-extrusion'`, `REACH_SELECTED_SOURCE_ID = 'reach-selected-source'`, `REACH_SELECTED_CASING_LAYER_ID = 'reach-selected-casing'`, `REACH_SELECTED_LAYER_ID = 'reach-selected'`, `REACH_LINKS_SOURCE_ID = 'reach-links-source'` and `REACH_LINKS_LAYER_ID = 'reach-links'`. The links source and layer are used in Task 10.
- **Produces, `layerOrder.ts`:**
  - `ANSWER_LAYER_IDS` also lists `REACH_LINKS_LAYER_ID`, but **not** the reach fill or columns.
  - `reachBeforeId(layers): string | undefined`: the district fill layer if it is on the map, else the lowest answer layer, else the first label. That puts the reach fill and columns beneath the district outlines (decision 18) and beneath isochrone and route results, while district layers added later still land above them through `contextBeforeId`.
  - The module comment gains this exception.
- **Produces, `layerVisibility.ts`:** `reachLayerVisibility(s: { enabled: boolean; ready: boolean; is3D: boolean }): { fill: boolean; extrusion: boolean; selection: boolean; hideBuildingExtrusion: boolean }`:
  - `fill` = on, ready and not 3D;
  - `extrusion` = on, ready and 3D;
  - `selection` = on and ready;
  - `hideBuildingExtrusion` = on, whether or not the payload has arrived. `applyLayerVisibility` reads it through `getState()`, which can see the store but not the query.

- [ ] **Step 1: Write the failing tests.**

```ts
// layerVisibility.test.ts
it('shows the flat fill in 2D and the columns in 3D', () => {
  expect(reachLayerVisibility({ enabled: true, ready: true, is3D: false })).toEqual({ fill: true, extrusion: false, selection: true, hideBuildingExtrusion: true });
  expect(reachLayerVisibility({ enabled: true, ready: true, is3D: true })).toMatchObject({ fill: false, extrusion: true });
});
it('shows nothing and hides no buildings when off', () => {
  expect(reachLayerVisibility({ enabled: false, ready: true, is3D: true })).toEqual({ fill: false, extrusion: false, selection: false, hideBuildingExtrusion: false });
});
it('hides the 3D buildings as soon as it is on, before its own layers are ready', () => {
  expect(reachLayerVisibility({ enabled: true, ready: false, is3D: true })).toEqual({ fill: false, extrusion: false, selection: false, hideBuildingExtrusion: true });
});
// layerOrder.test.ts
it('puts the reach fill beneath the district outlines', () => {
  expect(reachBeforeId([background, road, { id: DISTRICT_FILL_LAYER_ID, type: 'fill' }, { id: DISTRICT_LINE_LAYER_ID, type: 'line' }, label])).toBe(DISTRICT_FILL_LAYER_ID);
});
it('puts district layers added later above the reach fill', () => {
  expect(contextBeforeId([background, road, { id: REACH_FILL_LAYER_ID, type: 'fill' }, label])).toBe('road-label');
});
it('puts the reach fill beneath an isochrone', () => {
  expect(reachBeforeId([background, road, { id: ISOCHRONE_FILL_LAYER_ID, type: 'fill' }, label])).toBe(ISOCHRONE_FILL_LAYER_ID);
});
```

- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3: Implement the pure parts**, then MapView. Each piece below is a separate `useEffect` or handler branch in MapView.
  1. **Source and layers**, once a payload and `mapReady` are both there:
     - Add the source, or `setData` on a city change, with `promoteId: 'h'` and the attribution `Population: GHSL, European Commission JRC (CC BY 4.0)`.
     - Add `REACH_FILL_LAYER_ID` (`fill`, `reachBeforeId`, `fill-opacity` = `REACH_FILL_OPACITY`, `'fill-antialias': false` so neighbouring hexagons don't show hairline seams) and `REACH_EXTRUSION_LAYER_ID` (`fill-extrusion`, `reachBeforeId`, height from `reachHeightExpression()`, colour from `reachExtrusionColourExpression`, opacity 0.9).
     - Add `REACH_SELECTED_SOURCE_ID` (an empty FeatureCollection) with two `line` layers and no `beforeId`, so they stay on top: casing `REACH_SELECTION.casing` at width 5, line `REACH_SELECTION.line` at width 2.5.
     - Every layer starts hidden.
  2. **Colours:**
     - With `REACH_RECOLOUR === 'feature-state'`, the fill and column colours read `MISSING_FROM_STATE` and are set once. A recolour writes `setFeatureState({ source: REACH_SOURCE_ID, id }, { missing })` for every block from `missingCounts`, on a change of minutes, needs, `k` or the payload.
     - With `'expression'`, a recolour calls `setPaintProperty` with `reachColourExpression(missingCountExpression(...))` and its column counterpart.
     - Either way, never on a selection change.
  3. **Selection:** on a change of `selectedCell`:
     - `setData` on `REACH_SELECTED_SOURCE_ID` with the selected block's feature, found in the payload (or an empty collection);
     - clear `selected` feature state on the previously selected block, and set it on the new one.
  4. **Visibility:** apply `reachLayerVisibility` to the reach layers. `applyLayerVisibility` and `addExtrusionLayer` hide `BUILDING_EXTRUSION_LAYER_ID` whenever `hideBuildingExtrusion` holds, reading `useReachStore.getState().enabled`. The visibility effect also depends on the reach switch, so it calls `applyLayerVisibility` again whenever reach turns on or off.
  5. **Clicks:** a branch after the route branch and before the heatmap branch. When `useReachStore.getState().enabled`, query the visible reach fill or extrusion layer at the point, `selectCell` the first feature's `h` (or `null`), and return.
  6. **Hover:** when reach is on, show the pointer over a block and the default cursor elsewhere.
- [ ] **Step 4:** Run `npm test`, `npm run build` and `npm run lint`. Expected: PASS. The controller can do a quick live check of `useReachStore.setState({ enabled: true })` through the store-module trick from Task 1, and confirm the console stays clean; the full check is Task 12.
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/constants/layerConfig.ts cityscope/src/lib/layerOrder.ts cityscope/src/lib/layerOrder.test.ts cityscope/src/lib/reach/layerVisibility.ts cityscope/src/lib/reach/layerVisibility.test.ts cityscope/src/components/MapView.tsx
git commit -m "feat(web): draw everyday reach blocks, 3D columns and the selected block"
```

---

### Task 8: The sidebar switch and the reach panel

**Files:**
- Create: `cityscope/src/components/LayerSwitchRow.tsx`, `cityscope/src/components/results/BarRows.tsx`, `cityscope/src/components/reach/ReachPanel.tsx`, `ReachMethodNote.tsx`, `cityscope/src/lib/reach/copy.ts`, `copy.test.ts`
- Modify: `cityscope/src/components/Sidebar.tsx`, `cityscope/src/components/results/CategoryBars.tsx`, `cityscope/src/components/results/bars.ts`

**Interfaces:**
- **Consumes:** `useReachPayload`, `useReachSummary` and `reachAvailability` (Task 6); `clearForReach` and `useReachStore` (Task 4); `reachLegend`, `REACH_CLASS` and `REACH_FILL_OPACITY` (Task 3); `pickStop` and `REACH_NEEDS` (Task 2); `RECOLOUR_ON_RELEASE` (Task 2).
- **Produces, `LayerSwitchRow`:** props `{ label: string; colour: string; on: boolean; onChange: (on: boolean) => void; busy?: boolean; disabled?: boolean; caption?: string | null }`. It is the existing row markup from `Sidebar.tsx` lines 142–187, moved out, with an optional caption line under the label. Sidebar's four layer rows use it unchanged.
- **Produces, `results/bars.ts`:** `interface BarRowView { key: string; iconCategory: string; label: string; value: string; detail?: string; barPct: number; srLabel: string; dimmed?: boolean }`. It lives in the pure `bars.ts`, so `lib/reach/copy.ts` can import the type without importing a component.
- **Produces, `BarRows`:** props `{ title: string; rows: ReadonlyArray<BarRowView> }`. It is the row markup moved out of `CategoryBars`. `CategoryBars` maps `toBars` rows onto it, so its tests and its look stay the same.
- **Produces, `copy.ts`:**
  - `percent(share: number): string`:
    - 0 gives "0%" and 1 gives "100%";
    - above 0 and below 0.005 gives "<1%";
    - from 0.995 up to (not including) 1 gives one decimal rounded down, e.g. "99.9%";
    - otherwise a whole percent.
  - `formatResidents(n: number): string`. One decimal and " M" from a million up; otherwise rounded to the nearest thousand with `formatCount`.
  - `coverageLine(meta)`, e.g. "Berlin · whole city · 3.6 M estimated residents".
  - `headlineSentence(needs, minutes)`:
    - six needs: "of residents live within 15 minutes' walk of all six everyday needs";
    - one need: "… of a pharmacy" (the label lower-cased);
    - two to five: "… of all three chosen needs".
  - `rangeLine(low, high)`. When both ends are ordinary whole percents, "range 62–72%"; otherwise `percent` at each end, e.g. "range 99.4%–99.9%".
  - `rangeExplanation(kLow, kHigh)`, e.g. "How far the figure moves if walking pace is anywhere from 57 to 68 straight-line metres a minute: the calibration's uncertainty."
  - `agreementLine(agreement: number, alwaysWithin: number | undefined)`, e.g. "97% (always answering 'within' scores 94%)", or just "97%" when there's no base rate.
  - `switchCaption(a: ReachAvailability): string | null`. `'not-built'` gives "Not built for this city yet", `'not-reliable'` gives "Estimate not reliable here yet", and anything else gives null.
  - `needBarRows(perNeed: Record<NeedId, number>, selected: readonly NeedId[]): BarRowView[]`. All six rows in display order, with `barPct` = share × 100, `value` = `percent(share)`, and `dimmed` set when the need isn't selected.

- [ ] **Step 1: Write the failing tests** in `copy.test.ts`:

```ts
it('never rounds a share that is not exactly 0 or 1 to 0% or 100%', () => {
  expect([0, 0.003, 0.674, 0.9944, 0.9993, 1].map(percent)).toEqual(['0%', '<1%', '67%', '99%', '99.9%', '100%']);
});
it('formats residents in millions or rounded thousands', () => {
  expect(formatResidents(3624966)).toBe('3.6 M');
  expect(formatResidents(888663)).toBe('889,000');
  expect(formatResidents(282756)).toBe('283,000');
});
it('builds the coverage line', () => {
  expect(coverageLine({ cityName: 'Tokyo', coverage: 'the 23 wards', residents: 9059277 })).toBe('Tokyo · the 23 wards · 9.1 M estimated residents');
});
it('words the headline for six, one and some needs', () => {
  expect(headlineSentence(NEED_IDS, 15)).toBe("of residents live within 15 minutes' walk of all six everyday needs");
  expect(headlineSentence(['ph'], 10)).toBe("of residents live within 10 minutes' walk of a pharmacy");
  expect(headlineSentence(['sm', 'pk', 'st'], 20)).toBe("of residents live within 20 minutes' walk of all three chosen needs");
});
it('writes the range as whole percentages, and with decimals near 100%', () => {
  expect(rangeLine(0.6199, 0.7204)).toBe('range 62–72%');
  expect(rangeLine(0.9941, 0.9993)).toBe('range 99%–99.9%');
});
it('shows agreement beside the base rate', () => {
  expect(agreementLine(0.9722, 0.9389)).toBe("97% (always answering 'within' scores 94%)");
});
it('captions a disabled switch', () => {
  expect(switchCaption('not-built')).toBe('Not built for this city yet');
  expect(switchCaption('not-reliable')).toBe('Estimate not reliable here yet');
  expect(switchCaption('ready')).toBeNull();
});
it('lists all six needs as bars and dims the unchosen ones', () => {
  const rows = needBarRows({ sm: 0.95, ph: 0.86, dr: 0.85, sc: 0.94, pk: 0.97, st: 0.78 }, ['sm', 'st']);
  expect(rows.map((r) => [r.key, r.barPct, r.dimmed ?? false])).toEqual([['sm', 95, false], ['ph', 86, true], ['dr', 85, true], ['sc', 94, true], ['pk', 97, true], ['st', 78, false]]);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/reach/copy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `copy.ts`, then the components.**
  - **Sidebar:** after the four layer rows, add a `LayerSwitchRow` labelled "Everyday reach" with colour `ROLE.answer`, `busy` while loading, `disabled` with its caption for `'not-built'` and `'not-reliable'`, and `onChange(on)` calling `clearForReach()` then `setEnabled(true)`, or `setEnabled(false)`. Under it goes `<Collapse in={reachOn}><ReachPanel /></Collapse>`.
  - **`ReachPanel`**, top to bottom as in the spec:
    1. the coverage line;
    2. the headline: `percent(share)` in large type, `headlineSentence`, `rangeLine`, and `rangeExplanation` in small text;
    3. "Within", then the time control, then "minutes of";
    4. six need `ToggleButton`s (icon and label, `aria-pressed`) that wrap into two rows of three in the 296 px panel, where the last selected one is `disabled`;
    5. `BarRows` titled "Within the limit, by need";
    6. the legend, with swatches drawn at `REACH_FILL_OPACITY` on a `SURFACE.land` background;
    7. a "How this is measured" text button (`ROLE.you`) that expands `ReachMethodNote`.
  - **The time control:**
    - It's an MUI `Slider` with `min` and `max` set to the first and last of `meta.stops`, `marks` = `meta.stops`, `step={null}`, `aria-label="Time limit"`, and `getAriaValueText` = `` `${v} minutes` ``.
    - With a single stop it is plain text ("15 minutes"), since a slider can't have `min === max`.
    - With `RECOLOUR_ON_RELEASE`, the slider keeps a local preview value for the headline and writes the store on `onChangeCommitted`; otherwise it writes the store on `onChange`.
  - **Panel effects:** one turns the switch off when availability is `'not-built'` or `'not-reliable'`; one snaps the store's minutes with `pickStop(meta.stops, minutes)` when the payload arrives. The `'error'` state shows "Couldn't load Everyday reach" and a Retry button that calls `refetch`.
  - **`ReachMethodNote`**, every figure from `meta`:
    - **the method:** straight-line distance from each block's centre to the nearest place, divided by `k` straight-line metres a minute, fitted against Mapbox walking times on `sampleSize` blocks;
    - **agreement for each stop**, with `agreementLine` and the base rate. Two notes go with it: agreement is measured on the held-out half at a pace fitted on the other half, so it describes a slightly different fit from the `k` the map uses; and the 5-minute figure is the informative one, because at longer limits most places are within reach anyway;
    - **sources and dates:** `sources.places`, fetched `placesFetchedAt`; `sources.population`; calibrated on the date of `calibratedAt`;
    - **places per 100,000 residents** for each need;
    - **the London GP check**, only when present: "71% of 1,142 NHS GP practices have an OpenStreetMap doctor or clinic within 150 m, so distances to a doctor may be overstated";
    - **the limits:** residents are GHSL estimates, not a census; buses are not counted; distances are measured in a straight line from each block's centre.
- [ ] **Step 4:** Run `npm test` (the existing `bars.test.ts` and `CategoryBars` behaviour must be unchanged), `npm run build` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** in three parts: the two extractions first, so the panel diff is small.

```bash
git add cityscope/src/components/LayerSwitchRow.tsx cityscope/src/components/Sidebar.tsx
git commit -m "refactor(web): one switch row for every sidebar layer"
git add cityscope/src/components/results/BarRows.tsx cityscope/src/components/results/bars.ts cityscope/src/components/results/CategoryBars.tsx
git commit -m "refactor(web): share the bar-row markup"
git add cityscope/src/lib/reach/copy.ts cityscope/src/lib/reach/copy.test.ts cityscope/src/components/reach/ReachPanel.tsx cityscope/src/components/reach/ReachMethodNote.tsx cityscope/src/components/Sidebar.tsx
git commit -m "feat(web): everyday reach switch, headline panel and method note"
```

---

### Task 9: The block card and the phone card

**Files:**
- Create: `cityscope/src/components/MapCardSlot.tsx`, `cityscope/src/components/reach/ReachCard.tsx`, `cityscope/src/lib/reach/card.ts`, `card.test.ts`, `cityscope/src/lib/flyToPlace.ts`
- Modify:
  - Cards: `cityscope/src/components/HeatmapSpotlightCard.tsx`, `cityscope/src/App.tsx`
  - Results: `results/PlaceList.tsx`, `results/CategoryIcon.tsx`, `results/categoryIcons.ts`, `categoryIcons.test.ts`, `results/format.ts`, `format.test.ts`

**Interfaces:**
- **Consumes:** `useReachCard` and `useReachSummary` (Task 6), `useReachStore` (Task 4), `CellCard`, `ReachProperties`, `ReachMinutes`, `REACH_NEEDS` and `NONE_FOUND_METRES` (Task 2), `isWithin` (Task 2), `categoryLabel`, and the copy helpers (Task 8).
- **Produces, `card.ts`:**
  - `interface CardRowView { need: NeedId; label: string; iconCategory: string; name: string; minutesText: string; chosen: boolean; within: boolean | null; place: { lng: number; lat: number } | null }`
  - `cardRows(card: CellCard, props: ReachProperties, k: number, minutes: ReachMinutes, chosen: readonly NeedId[]): CardRowView[]`. Six rows in need order:
    - `within` = `isWithin(props[need], minutes, k)` for a chosen need, and null for an unchosen one, which is shown dimmed and unmarked;
    - `minutesText` = `` `~${Math.ceil(props[need] / k)} min` ``, or "—" when the payload has `NONE_FOUND_METRES`;
    - `name` is the card's name, else "Unnamed " + the lower-cased `categoryLabel(category)`, else "None in the data";
    - `iconCategory` is the card's category, else the need's.
  - `cardIsStale(card: CellCard, props: ReachProperties, k: number): boolean`. True when `card.metresPerMinute !== k`, or any need's card `metres` differs from the payload's. A null card distance matches `NONE_FOUND_METRES`.
- **Produces, `flyToPlace.ts`:** `flyToPlace(lng: number, lat: number): void`, which is `map.flyTo({ center, zoom: 16, duration: 800 })` (no `essential`). `PlaceList` uses it in place of its local `flyTo`.
- **Produces, `CategoryIcon`:** an optional `colour` prop.
- **Produces, `categoryIcons.ts` and `format.ts`:** `tram_stop` uses `TramIcon` and the label "Tram stop"; `subway_entrance` uses `SubwayIcon` and the label "Metro entrance". These are only for the card: the place lists still never contain them.
- **Produces, `MapCardSlot`:** props `{ visible: boolean; children: ReactNode }`. It is the positioning wrapper, `Slide` and card chrome moved out of `HeatmapSpotlightCard` (its lines 26–60); the spotlight card uses it unchanged. With `prefers-reduced-motion` (`useMediaQuery('(prefers-reduced-motion: reduce)')`), the `Slide` timeout is 0.

- [ ] **Step 1: Write the failing tests.**

```ts
// card.test.ts. PROPS (the payload's block): sm 380, ph 1050, dr 65535, sc 1020, pk 120, st 40; k 68.5.
// CARD (the endpoint) matches it: metresPerMinute 68.5; sm "La Vie Claire" 380; ph 1050; dr every field null;
// sc 1020; pk name null, category park, 120; st "Spandauer Straße/Marienkirche", category tram_stop, 40.
it('marks chosen needs within or outside the limit from the payload, and leaves unchosen ones unmarked', () => {
  expect(cardRows(CARD, PROPS, 68.5, 15, ['sm', 'ph', 'dr', 'pk']).map((r) => [r.need, r.within])).toEqual(
    [['sm', true], ['ph', false], ['dr', false], ['sc', null], ['pk', true], ['st', null]]);
});
it('shows rounded-up minutes from the payload', () => {
  expect(cardRows(CARD, PROPS, 68.5, 15, NEED_IDS).map((r) => r.minutesText)).toEqual(['~6 min', '~16 min', '—', '~15 min', '~2 min', '~1 min']);
});
it('names unnamed places by category and missing places plainly', () => {
  const rows = cardRows(CARD, PROPS, 68.5, 15, NEED_IDS);
  expect(rows.find((r) => r.need === 'pk')!.name).toBe('Unnamed park');
  expect(rows.find((r) => r.need === 'st')!.name).toBe('Spandauer Straße/Marienkirche');
  expect(rows.find((r) => r.need === 'dr')).toMatchObject({ name: 'None in the data', minutesText: '—', place: null });
});
it('follows the payload and flags a card from newer data', () => {
  expect(cardIsStale(CARD, PROPS, 68.5)).toBe(false);
  const newer = { ...CARD, needs: CARD.needs.map((n) => (n.need === 'ph' ? { ...n, metres: 900 } : n)) };
  expect(cardIsStale(newer, PROPS, 68.5)).toBe(true);
  expect(cardRows(newer, PROPS, 68.5, 15, NEED_IDS).find((r) => r.need === 'ph')!.within).toBe(false);
  expect(cardIsStale({ ...CARD, metresPerMinute: 70 }, PROPS, 68.5)).toBe(true);
});
// format.test.ts / categoryIcons.test.ts
it('labels the two station categories the card can show', () => {
  expect(categoryLabel('tram_stop')).toBe('Tram stop');
  expect(categoryLabel('subway_entrance')).toBe('Metro entrance');
});
```

In `categoryIcons.test.ts`, add `tram_stop` and `subway_entrance` to `CATEGORIES`, and replace its first comment with one saying these two appear only on the reach card, never in place lists.

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`ReachCard`**, mounted in `App.tsx` beside `HeatmapSpotlightCard`, inside a `MapCardSlot`. It is visible when reach is on and availability is `'ready'`, and (on `sm` and up) a block is selected, or (on `xs`) always.
  - **Block content:**
    - the header "This block · about {formatCount(residents)} residents" (residents from the payload), with a close button that calls `selectCell(null)` on desktop, or "Back to the city" doing the same on phones;
    - a short "Loading this block…" line while the card request runs; the minutes and marks don't wait for it, because they come from the payload;
    - one row per `cardRows` entry: icon, name, `minutesText`, and for a chosen need a ✓ (`CheckCircle`, `ROLE.answer`) or ✗ (`Cancel`, muted) with a visually hidden "within" or "not within". Unchosen rows are dimmed and have no mark;
    - each chosen ✗ row that has a place is a `ButtonBase` that calls `flyToPlace`;
    - when `cardIsStale`, the line "This block's data has changed since the map loaded. Reload to update." in muted text;
    - the footnote "Estimated walking times, measured from the block's centre".
  - **On `xs` with no block selected,** the card shows `percent(share)` large, `headlineSentence`, the coverage line, and an "Adjust" button that opens the sidebar.
- [ ] **Step 4:** Run `npm test`, `npm run build` and `npm run lint`. Expected: PASS, with the spotlight card's tests and look unchanged.
- [ ] **Step 5: Commit** in three parts.

```bash
git add cityscope/src/components/MapCardSlot.tsx cityscope/src/components/HeatmapSpotlightCard.tsx cityscope/src/lib/flyToPlace.ts cityscope/src/components/results/PlaceList.tsx
git commit -m "refactor(web): share the map card slot and the fly-to-place move"
git add cityscope/src/components/results/categoryIcons.ts cityscope/src/components/results/categoryIcons.test.ts cityscope/src/components/results/format.ts cityscope/src/components/results/format.test.ts cityscope/src/components/results/CategoryIcon.tsx
git commit -m "feat(web): icons and labels for tram stops and metro entrances on the reach card"
git add cityscope/src/lib/reach/card.ts cityscope/src/lib/reach/card.test.ts cityscope/src/components/reach/ReachCard.tsx cityscope/src/App.tsx
git commit -m "feat(web): everyday reach block card and phone card"
```

---

### Task 10: Lines and pins to the nearest places

**Files:**
- Modify: `cityscope/src/lib/reach/card.ts`, `card.test.ts`, `cityscope/src/lib/mapPins.ts`, `cityscope/src/components/MapView.tsx`

**Interfaces:**
- **Consumes:** `CellCard`, `ReachProperties` and `isWithin` (Task 2), `REACH_LINKS_SOURCE_ID` and `REACH_LINKS_LAYER_ID` (Task 7), `CategoryIcon` with `colour` (Task 9), and `useReachCard` and `useReachSummary` (Task 6).
- **Produces, `card.ts`:**
  - `cellCentre(ring: ReadonlyArray<[number, number]>): [number, number]`, the mean of the ring's distinct corners (the closing point dropped).
  - `linkLines(card: CellCard, props: ReachProperties, k: number, minutes: ReachMinutes, chosen: readonly NeedId[], centre: [number, number]): GeoJSON.FeatureCollection<GeoJSON.LineString>`. One line per chosen need that is within the limit (by the payload) and has coordinates on the card, from the centre to the place, with `need` and `category` as properties. It gives no lines when `cardIsStale`, so a line never points at a place the colour didn't count.
- **Produces, `mapPins.ts`:** `createCategoryPin(category: string): { element: HTMLDivElement; dispose: () => void }`.
  - It is a 22 px disc in `ROLE.answer` with an `INK` border. It renders `createElement(CategoryIcon, { category, size: 13, colour: INK })` into the disc with `createRoot` (no JSX), and has an `aria-label` of the category label.
  - `dispose` unmounts the root with `setTimeout(() => root.unmount(), 0)`. MapView calls it from effect cleanups, which React runs inside its commit, where a synchronous unmount logs an error.
  - The module comment changes: pins are no longer all "you"; result pins use the answer colour.

- [ ] **Step 1: Write the failing tests** in `card.test.ts`:

```ts
it('finds the centre of a closed hexagon ring', () => {
  expect(cellCentre([[0, 0], [2, 0], [3, 1], [2, 2], [0, 2], [-1, 1], [0, 0]])).toEqual([1, 1]);
});
it('draws lines only to chosen places within the limit', () => {
  expect(linkLines(CARD, PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features.map((f) => f.properties!.need)).toEqual(['pk', 'st']);
  expect(linkLines(CARD, PROPS, 68.5, 5, ['sm', 'st'], [13.4, 52.5]).features.map((f) => f.properties!.need)).toEqual(['st']);
});
it('draws no lines from a card that is newer than the payload', () => {
  expect(linkLines({ ...CARD, metresPerMinute: 70 }, PROPS, 68.5, 15, NEED_IDS, [13.4, 52.5]).features).toEqual([]);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/reach/card.test.ts`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.** In MapView:
  - **Links effect:** add or update `REACH_LINKS_SOURCE_ID` with `linkLines` (the centre from `cellCentre` of the selected feature's ring in the payload), as an answer-slot `line` layer in `ROLE.answer`, width 2 with dashes `[2, 1]`, visible only with `selection`.
  - **Pins effect:** one `createCategoryPin` marker per line end. Keep `{ marker, dispose }` in a ref, and remove and dispose them on every change and on unmount.
- [ ] **Step 4:** Run `npm test`, `npm run build` and `npm run lint`. Expected: PASS. The controller checks in the running app that selecting and reselecting blocks leaves the console clean (StrictMode mounts effects twice).
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/lib/reach/card.ts cityscope/src/lib/reach/card.test.ts cityscope/src/lib/mapPins.ts cityscope/src/components/MapView.tsx
git commit -m "feat(web): lines and pins from a block to its nearest everyday places"
```

---

### Task 11: The welcome example

**Files:**
- Modify: `cityscope/src/lib/examples.ts`, `examples.test.ts`, `cityscope/src/components/WelcomeDialog.tsx`

**Interfaces:**
- **Consumes:** `ShareState.reach` and `effectiveReach` (Task 5).
- **Produces:** the example `tokyo-reach` replaces `tokyo-density`.
  - Title: "Everyday needs within 15 minutes in Tokyo".
  - Kicker: "Tokyo · everyday reach".
  - Icon: `HexagonOutlined`.
  - State: `{ v: 1, city: 'tokyo', view: { lng: 139.735, lat: 35.685, zoom: 11.3, bearing: -20, pitch: 60 }, layers: { roads: true, buildings: true, districts: false, heatmap: false }, is3D: true, reach: { t: 15, n: ['sm', 'ph', 'dr', 'sc', 'pk', 'st'] } }`. The pitch and bearing match what MapView's 3D effect eases to, so the view doesn't jump.
  - The `EXAMPLES` doc comment notes the Tokyo figure it was chosen on: 81% within 15 minutes of all six, range 80–89%, measured 2026-11-06.

- [ ] **Step 1: Write the failing test.**

```ts
it('has one example that opens Everyday reach', () => {
  const reach = EXAMPLES.filter((e) => effectiveReach(e.state));
  expect(reach.map((e) => e.id)).toEqual(['tokyo-reach']);
});
```

The existing round-trip, unique-id and digit-free-kicker tests cover the rest.

- [ ] **Step 2:** Run `npx vitest run src/lib/examples.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Replace the example.
  - In `WelcomeDialog.choose`, open the sidebar when `example.state.tool || (example.state.reach && window.innerWidth >= 600)`. On phones the bottom card shows the headline, and an open drawer would cover it. The 600 px matches `uiStore`'s rule.
- [ ] **Step 4:** Run `npm test`, `npm run build` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add cityscope/src/lib/examples.ts cityscope/src/lib/examples.test.ts cityscope/src/components/WelcomeDialog.tsx
git commit -m "feat(web): an everyday reach example on the welcome card"
```

---

### Task 12: Verify live (controller, owner's servers)

**Files:** fixes only, as found, each committed on its own.

- [ ] **Step 1: The endpoints, with `curl`.** Check both endpoints on the owner's backend and on `https://cityscope-rzj5.onrender.com`. Then, for 20 random blocks in each city, check that the card endpoint's `metres` for every need equal the block's payload properties. With equal data, `cardIsStale` stays false and the card shows names for the right places.
- [ ] **Step 2: Measure the recolouring again.** Repeat Task 1's `visible` timing on the real reach layer, changing the time from the panel, and record it beside Task 1's figures. Also time one block selection: it must not reload the reach source (no `sourcedataloading` event for `reach-source`).
- [ ] **Step 3: Check the app in the built-in browser** on `http://localhost:5173`, with the pane displayed:
  - **Turning the layer on and off:** by the switch; by the heatmap and by each tool (each turns reach off, and reach turns each of them off); by a share link; by the welcome example; and across a city change (the selection clears and the new city's layer loads).
  - **Each state:**
    - **Loading:** the spinner on the switch.
    - **Error with Retry:** override `window.fetch` in the page for `/reach` to answer 500.
    - **Not built:** a 404 override.
    - **Not reliable:** an override that sets `meta.passes = false`.
    - **Stale card:** an override of the card endpoint that changes one `metres`, which shows the stale line, keeps the marks matching the colour, and draws no lines.
    - **Cold start:** the existing pill.
    - Restore `fetch` by reloading.
  - **Interaction:**
    - Time and needs: the headline updates at once, and the map follows the Task 1 rule.
    - Card and colour: for five clicked blocks, the number of ✗ marks equals the block's class. Choose a single need and check that the other five rows are dimmed and unmarked.
    - A ✗ row flies to its place.
    - District outlines switched on draw above the blocks.
  - **3D and phones:**
    - In 3D, the three classes are told apart on lit columns, the selected column is gold, and the 3D buildings are hidden, then return when the layer goes off.
    - At phone width (`resize_window` mobile), one bottom card shows the headline and then the block with "Back to the city", and the search box stays clear. Reset the viewport afterwards.
  - **Links and examples:** a share-link round trip, with time, needs and block restored, and an old link without `reach` opening exactly as before.
  - **Console:** `read_console_messages` shows zero errors and warnings, after selecting at least ten blocks.
  - **Readability:** on first switch-on, the coverage line and the headline are visible without scrolling (success criterion 1). Paris at 20 minutes reads "99.9%", not "100%".
- [ ] **Step 4:** Send the owner screenshots of 2D, 3D, the phone card and the method note. Fix what the checks find, with a test first where the bug is in pure logic.

---

### Task 13: Documentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-17-everyday-reach-design.md`

- [ ] **Step 1: README.**
  - **"What it does":** add an **Everyday reach** row: what it shows, typed-array headline in the browser, H3 blocks, calibrated estimate.
  - **API note:** the "map layer … is not built yet" sentence now says the layer reads these two endpoints.
  - **"Layers" row:** mention the fifth switch.
  - **Data & honesty note:**
    - A per-city table, in alphabetical order, of the headline at 15 minutes for all six needs, with its range and coverage label. Measure it with the summary rule from production on the day, and state the date; say plainly that it is not a ranking.
    - Beside the base-rate paragraph, one sentence saying the app's method note shows each time's agreement next to what always answering "within" would score.
    - **"Where it breaks":** the three worst calibration blocks from the 2026-11-06 production run, each with what Mapbox disagreed on. The blocks are:
      - Tokyo `892f5aadb8fffff` (35.67383, 139.71863), 7 of 24 checks wrong;
      - Munich `891f8d4e977ffff` (48.08126, 11.49144), 5 wrong;
      - Berlin `891f1d482b7ffff` (52.52519, 13.27961), 5 wrong.
    - Each block also gets a share link to the deployed app framing it, with the `reach` entry, `c` set and no tool. The links only open once Phase 2 is merged and deployed: add them now, and check them after the deploy.
    - Ask the owner for a screenshot of each; if they decline, the links stand alone, and the spec amendment says so.
- [ ] **Step 2: CLAUDE.md.**
  - The Everyday reach heading and status now say Phase 2 shipped.
  - Add `reachStore` to the store list.
  - Add architecture lines:
    - reach excludes the heatmap and the tools;
    - the colours, the headline and the card all use one within rule (`metres ≤ minutes × k`) on the payload's numbers;
    - selection never changes a filter or a data-driven paint property on the reach source;
    - district outlines draw above the reach layer.
  - Add the share-link `reach` entry to the Save & Share line.
- [ ] **Step 3: The spec.** Complete `## Amendments while building Phase 2` with:
  - every decision above that differs from or adds to the spec: decisions 2, 3, 5, 6 (with the final colours and opacity), 7, 9, 12, 13, 14, 15, 16, 17, 18, 19 and 20;
  - New York's tallest columns;
  - the second recolouring measurement;
  - the headline table.
- [ ] **Step 4: Commit** in three parts.

```bash
git add README.md
git commit -m "docs: everyday reach in the README, with headlines and where it breaks"
git add CLAUDE.md
git commit -m "docs: everyday reach phase 2 in CLAUDE.md"
git add docs/superpowers/specs/2026-10-17-everyday-reach-design.md
git commit -m "docs: everyday reach phase 2 amendments and measurements"
```
