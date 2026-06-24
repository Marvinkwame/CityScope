# Save & Share View — Design

**Date:** 2026-06-13
**Goal:** Encode the current map state (city, view, layers, 3D, and the active analysis tool) into the URL hash so a view can be shared via a link and restored on load — turning the app from a session-only demo into a deep-linkable product.

## Scope

Frontend only, no backend, no new dependencies. Captures the durable, shareable state; ignores transient state (click selection, loading/error, heatmap spotlight, geocoder result). All three analysis tools (isochrone, route, draw) are restorable.

**Decisions locked in brainstorming:** encode state as a base64url JSON blob in the URL **hash**; keep the hash **live-synced** as state changes, plus a **Copy-link** button.

## 1. Codec (pure, testable core)

`cityscope/src/lib/shareCodec.ts` — the serializable type plus encode/decode:

```ts
export interface ShareState {
  v: 1;
  city: string;                                   // city id
  view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number };
  layers: { roads: boolean; buildings: boolean; districts: boolean; heatmap: boolean };
  is3D: boolean;
  tool?: ShareTool;                               // at most one (tools are mutually exclusive)
}
export type ShareTool =
  | { kind: 'isochrone'; profile: TravelProfile; contourMinutes: number[]; origin: LngLat }
  | { kind: 'route'; profile: TravelProfile; origin: LngLat; destination: LngLat }
  | { kind: 'draw'; polygon: PolygonGeometry };
```

Reusing existing types: `TravelProfile` from `isochroneStore`, `PolygonGeometry` from `drawStore`, and `LngLat = { lng: number; lat: number }` (the shape the stores already use).

- `encodeState(state): string` — `JSON.stringify` → base64url (btoa over UTF-8-safe bytes, then `+/=` → `-_` and strip padding).
- `decodeState(raw: string): ShareState | null` — reverse the transform, `JSON.parse` in a `try/catch`, then **validate** (`v === 1`, `city` string, numeric `view` fields, the four boolean layers, `is3D` boolean, and—if `tool` present—a known `kind` with valid fields). Returns `null` on any malformed/old input. Never throws.

This module is the TDD unit (no DOM, no stores).

## 2. Collect + apply (the glue)

`cityscope/src/lib/shareState.ts`:
- `collectShareState(map): ShareState` — reads the stores (`cityStore`, `layerStore`, `mapStore.is3D`, and whichever of `isochroneStore`/`routeStore`/`drawStore` is `enabled`) and the live map (`getCenter/getZoom/getBearing/getPitch`).
- `applyShareState(state, map): void` — writes it back in this order to avoid the city-change auto-`flyTo` clobbering the restored view:
  1. resolve + set city (see §3), 2. `layerStore.setLayers(state.layers)`, 3. `mapStore.setIs3D(state.is3D)`, 4. set the active tool's stores (enable + params), 5. **`map.jumpTo(view)` last** (jump, not fly — nothing animates over it).

## 3. Orchestration — `useShareSync` hook

`cityscope/src/hooks/useShareSync.ts`, called once in `App`:
- **Hydrate once**, gated on *map ready* AND *cities loaded* (the hash carries only the city `id`; resolve it against the fetched cities list, falling back to the default city if unknown). A `hydratingRef` guard suppresses the live writer (and the MapView city-change flyTo) while applying.
- **Live write** after hydration: subscribe to the relevant stores + the map's `moveend`; on change, debounce (~400 ms), `collectShareState` → `encodeState` → `history.replaceState(null, '', '#s=' + encoded)` (replace, not push — no history spam).
- Feedback-loop safety: the writer is gated off during hydration, and the `jumpTo` it performs fires `moveend` only after the guard clears.

## 4. Copy-link button

`cityscope/src/components/ShareButton.tsx` in the navbar → `navigator.clipboard.writeText(window.location.href)` with a brief MUI `Snackbar` confirmation ("Link copied"). Because the hash is always current, it copies whatever is in the address bar.

## 5. Store additions (for clean hydration)

- `layerStore`: add `setLayers(layers: Record<LayerId, boolean>)` (today only `toggleLayer`).
- `mapStore`: add `setIs3D(value: boolean)` (today only `toggle3D`).
- `MapView`: when draw is enabled and `drawStore.polygon` is set but the MapboxDraw control has no feature (i.e. the polygon came from the URL, not a draw event), `draw.add` the polygon so the restored shape renders. Guard with the existing `drawRef`/`mapReady`.

## 6. Edge cases

- No hash → start fresh (defaults); writer begins after hydration completes.
- Malformed or wrong-version hash → `decodeState` returns `null` → ignore, start fresh (optional `console.warn`).
- Unknown city id → default city.
- Tool params present but incomplete (e.g. route with only origin) → restore what's valid; the tool's own hooks stay disabled until requirements are met (route needs both A and B).
- URL length: a drawn polygon is small (a handful of vertices); well within browser limits. Noted, not guarded.

## 7. Testing

- **Unit (Vitest):** `shareCodec` — round-trip (`decodeState(encodeState(s))` deep-equals `s`) for a view-only state and a state with each tool kind; `decodeState('not-base64')` → `null`; wrong `v` → `null`; encoded output contains no `+`, `/`, or `=`.
- **Manual:** set a city + pan/zoom + an active isochrone, click Share, open the copied link in a fresh tab → the same city, view, layers, and isochrone are restored.

## Out of scope

- Server-side short links / persistence (it's all client-side hash state).
- Serializing transient UI (selected feature, spotlight, sidebar open/closed, loading).
- Restoring fetched *results* directly — tools restore their inputs and re-run their queries.

## Affected files

**New**
- `cityscope/src/lib/shareCodec.ts` + `shareCodec.test.ts`
- `cityscope/src/lib/shareState.ts`
- `cityscope/src/hooks/useShareSync.ts`
- `cityscope/src/components/ShareButton.tsx`

**Edit**
- `cityscope/src/store/layerStore.ts` (`setLayers`)
- `cityscope/src/store/mapStore.ts` (`setIs3D`)
- `cityscope/src/App.tsx` (call `useShareSync`)
- `cityscope/src/components/Navbar.tsx` (mount `ShareButton`)
- `cityscope/src/components/MapView.tsx` (re-add restored polygon to MapboxDraw)
