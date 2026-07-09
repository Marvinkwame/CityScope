# Save & Share View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode the current map state (city, view, layers, 3D, active analysis tool) into the URL hash so a view is shareable via a link and restored on load.

**Architecture:** A pure `shareCodec` (base64url JSON) is the tested core. `shareState` collects state from the Zustand stores + the live map and applies it back (order-controlled, with a hydration guard so the city-change auto-fly doesn't clobber the restored view). A `useShareSync` hook hydrates once on load and live-writes the hash (debounced, `replaceState`). A navbar `ShareButton` copies the current URL.

**Tech Stack:** React 19, TypeScript, Vite 8, Zustand 5, TanStack Query 5, MUI 7, Mapbox GL JS 3, `@mapbox/mapbox-gl-draw`, Vitest (new to the frontend).

**Prereqs:** all analysis tools (isochrone/route/draw) and their stores exist; `useCities` provides the city list; `MapView` owns the map (in `mapStore.map`).

---

## File Structure

- `cityscope/src/lib/shareCodec.ts` (new) — `ShareState` type + `encodeState`/`decodeState` (pure).
- `cityscope/src/lib/shareCodec.test.ts` (new) — Vitest unit tests.
- `cityscope/src/lib/shareState.ts` (new) — `collectShareState`, `applyShareState`, hydration flag.
- `cityscope/src/hooks/useShareSync.ts` (new) — hydrate-once + live-write orchestration.
- `cityscope/src/components/ShareButton.tsx` (new) — navbar copy-link button + snackbar.
- `cityscope/src/store/layerStore.ts` (modify) — add `setLayers`.
- `cityscope/src/store/mapStore.ts` (modify) — add `setIs3D`.
- `cityscope/src/App.tsx` (modify) — call `useShareSync()`.
- `cityscope/src/components/Navbar.tsx` (modify) — mount `ShareButton`.
- `cityscope/src/components/MapView.tsx` (modify) — hydration guard on the city effect + re-add restored polygon to MapboxDraw.
- `cityscope/package.json`, tsconfig (modify) — Vitest.

---

## Task 1: Store setters for hydration

**Files:** Modify `cityscope/src/store/layerStore.ts`, `cityscope/src/store/mapStore.ts`

- [ ] **Step 1: `layerStore.setLayers`** — add to the interface and implementation:
```ts
// in the LayerState interface:
  setLayers: (layers: Record<LayerId, boolean>) => void;
// in the store body:
  setLayers: (layers) => set({ layers }),
```

- [ ] **Step 2: `mapStore.setIs3D`** — add to the interface and implementation:
```ts
// in the MapState interface:
  setIs3D: (value: boolean) => void;
// in the store body:
  setIs3D: (value) => set({ is3D: value }),
```

- [ ] **Step 3: Build** — from `cityscope`: `npm run build` → passes.

- [ ] **Step 4: Commit**
```bash
git add cityscope/src/store/layerStore.ts cityscope/src/store/mapStore.ts
git commit -m "feat(web): add setLayers/setIs3D store setters for state hydration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Share codec (TDD — adds Vitest to the frontend)

**Files:** `cityscope/package.json` (+ tsconfig), `cityscope/src/lib/shareCodec.ts`, `cityscope/src/lib/shareCodec.test.ts`

- [ ] **Step 1: Install Vitest** — from `cityscope`: `npm i -D vitest`

- [ ] **Step 2: Add script + exclude tests from the tsc build** — in `cityscope/package.json` scripts add `"test": "vitest run"`. In whichever tsconfig includes `src` for the app build (e.g. `tsconfig.app.json`), add `"src/**/*.test.ts"` to its `exclude` array so `tsc -b` ignores test files. (Vitest resolves `.ts` itself; use extensionless imports in tests.)

- [ ] **Step 3: Write the failing test** — create `cityscope/src/lib/shareCodec.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, type ShareState } from './shareCodec';

const base: ShareState = {
  v: 1,
  city: 'berlin',
  view: { lng: 13.4, lat: 52.5, zoom: 12.3, bearing: 0, pitch: 0 },
  layers: { roads: true, buildings: false, districts: true, heatmap: false },
  is3D: false,
};

describe('shareCodec', () => {
  it('round-trips a view-only state', () => {
    expect(decodeState(encodeState(base))).toEqual(base);
  });
  it('round-trips a state with an isochrone tool', () => {
    const s: ShareState = { ...base, tool: { kind: 'isochrone', profile: 'walking', contourMinutes: [5, 10, 15], origin: { lng: 13.4, lat: 52.5 } } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('round-trips a state with a drawn polygon', () => {
    const s: ShareState = { ...base, tool: { kind: 'draw', polygon: { type: 'Polygon', coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.6], [13.3, 52.5]]] } } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('returns null for non-base64/garbage', () => {
    expect(decodeState('!!!not-valid!!!')).toBeNull();
  });
  it('returns null for a wrong version', () => {
    const raw = encodeState({ ...base, v: 1 });
    // tamper: decode, bump version, re-encode manually is overkill — assert a hand-built bad blob:
    expect(decodeState(btoa('{"v":2}'))).toBeNull();
  });
  it('produces URL-safe output (no + / =)', () => {
    const out = encodeState(base);
    expect(out).not.toMatch(/[+/=]/);
  });
});
```

- [ ] **Step 4: Run, verify it fails** — `npm test` → FAIL (`./shareCodec` unresolved).

- [ ] **Step 5: Implement the codec** — create `cityscope/src/lib/shareCodec.ts`:
```ts
import type { TravelProfile } from '../store/isochroneStore';
import type { PolygonGeometry } from '../store/drawStore';

export type LngLat = { lng: number; lat: number };

export type ShareTool =
  | { kind: 'isochrone'; profile: TravelProfile; contourMinutes: number[]; origin: LngLat }
  | { kind: 'route'; profile: TravelProfile; origin: LngLat; destination: LngLat }
  | { kind: 'draw'; polygon: PolygonGeometry };

export interface ShareState {
  v: 1;
  city: string;
  view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number };
  layers: { roads: boolean; buildings: boolean; districts: boolean; heatmap: boolean };
  is3D: boolean;
  tool?: ShareTool;
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeState(state: ShareState): string {
  return toBase64Url(JSON.stringify(state));
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function decodeState(raw: string): ShareState | null {
  try {
    const obj = JSON.parse(fromBase64Url(raw)) as Record<string, unknown>;
    if (obj.v !== 1 || typeof obj.city !== 'string') return null;
    const view = obj.view as Record<string, unknown> | undefined;
    if (!view || !isNum(view.lng) || !isNum(view.lat) || !isNum(view.zoom) || !isNum(view.bearing) || !isNum(view.pitch)) {
      return null;
    }
    const layers = obj.layers as Record<string, unknown> | undefined;
    if (!layers || ['roads', 'buildings', 'districts', 'heatmap'].some((k) => typeof layers[k] !== 'boolean')) {
      return null;
    }
    if (typeof obj.is3D !== 'boolean') return null;
    // tool is validated loosely — malformed tool is dropped rather than failing the whole state
    const tool = obj.tool as ShareTool | undefined;
    const validTool =
      tool && (tool.kind === 'isochrone' || tool.kind === 'route' || tool.kind === 'draw') ? tool : undefined;
    return { ...(obj as unknown as ShareState), tool: validTool };
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run, verify it passes** — `npm test` → all shareCodec tests green. `npm run build` clean.

- [ ] **Step 7: Commit**
```bash
git add cityscope/src/lib/shareCodec.ts cityscope/src/lib/shareCodec.test.ts cityscope/package.json cityscope/package-lock.json cityscope/tsconfig*.json
git commit -m "test(web): add Vitest + share-state codec (base64url URL hash)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Collect + apply state

**Files:** Create `cityscope/src/lib/shareState.ts`

- [ ] **Step 1: Implement collect/apply + hydration flag** — create `cityscope/src/lib/shareState.ts`:
```ts
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCityStore, type City } from '../store/cityStore';
import { useLayerStore } from '../store/layerStore';
import { useMapStore } from '../store/mapStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useDrawStore } from '../store/drawStore';
import type { ShareState } from './shareCodec';

// Module-level flag so MapView can suppress its city-change reset/flyTo while we hydrate.
let hydrating = false;
export const isHydrating = (): boolean => hydrating;

export function collectShareState(map: MapboxMap): ShareState {
  const c = map.getCenter();
  const iso = useIsochroneStore.getState();
  const route = useRouteStore.getState();
  const draw = useDrawStore.getState();

  let tool: ShareState['tool'];
  if (iso.enabled && iso.origin) {
    tool = { kind: 'isochrone', profile: iso.profile, contourMinutes: iso.contourMinutes, origin: iso.origin };
  } else if (route.enabled && route.origin && route.destination) {
    tool = { kind: 'route', profile: route.profile, origin: route.origin, destination: route.destination };
  } else if (draw.enabled && draw.polygon) {
    tool = { kind: 'draw', polygon: draw.polygon };
  }

  return {
    v: 1,
    city: useCityStore.getState().selectedCity.id,
    view: { lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
    layers: { ...useLayerStore.getState().layers },
    is3D: useMapStore.getState().is3D,
    tool,
  };
}

export function applyShareState(state: ShareState, map: MapboxMap, cities: City[]): void {
  hydrating = true;

  const city = cities.find((c) => c.id === state.city);
  if (city) useCityStore.getState().setCity(city);

  useLayerStore.getState().setLayers(state.layers);
  useMapStore.getState().setIs3D(state.is3D);

  // reset all tools, then enable the one in the shared state
  useIsochroneStore.getState().setEnabled(false);
  useRouteStore.getState().setEnabled(false);
  useDrawStore.getState().setEnabled(false);

  const t = state.tool;
  if (t?.kind === 'isochrone') {
    const iso = useIsochroneStore.getState();
    iso.setProfile(t.profile);
    iso.setContourMinutes(t.contourMinutes);
    iso.setOrigin(t.origin);
    iso.setEnabled(true);
  } else if (t?.kind === 'route') {
    const r = useRouteStore.getState();
    r.setProfile(t.profile);
    r.setOrigin(t.origin);
    r.setDestination(t.destination);
    r.setEnabled(true);
  } else if (t?.kind === 'draw') {
    const d = useDrawStore.getState();
    d.setEnabled(true);
    d.setPolygon(t.polygon);
  }

  map.jumpTo({
    center: [state.view.lng, state.view.lat],
    zoom: state.view.zoom,
    bearing: state.view.bearing,
    pitch: state.view.pitch,
  });

  // Clear the flag on the next macrotask, after React has flushed the
  // city-change effect (which reads isHydrating() and bails).
  setTimeout(() => {
    hydrating = false;
  }, 0);
}
```
(NOTE on tool enabling: `setEnabled(false)` on isochrone/route/draw runs their `reset()`; that's why params are set *before* `setEnabled(true)`.)

- [ ] **Step 2: Build** — `npm run build` → passes. (`City` is exported from `cityStore`; confirm the import name matches.)

- [ ] **Step 3: Commit**
```bash
git add cityscope/src/lib/shareState.ts
git commit -m "feat(web): collect/apply shareable map state with hydration guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: useShareSync hook + wire-in + MapView guard

**Files:** Create `cityscope/src/hooks/useShareSync.ts`; modify `cityscope/src/App.tsx`, `cityscope/src/components/MapView.tsx`

- [ ] **Step 1: The hook** — create `cityscope/src/hooks/useShareSync.ts`:
```ts
import { useEffect, useRef } from 'react';
import { useMapStore } from '../store/mapStore';
import { useCityStore } from '../store/cityStore';
import { useLayerStore } from '../store/layerStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useDrawStore } from '../store/drawStore';
import { useCities } from './useCities';
import { encodeState, decodeState } from '../lib/shareCodec';
import { collectShareState, applyShareState } from '../lib/shareState';

export function useShareSync(): void {
  const map = useMapStore((s) => s.map);
  const { data: cities } = useCities();
  const hydratedRef = useRef(false);

  // Hydrate once, when both the map and the city list are ready.
  useEffect(() => {
    if (hydratedRef.current || !map || !cities) return;
    hydratedRef.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith('#s=')) return;
    const state = decodeState(hash.slice(3));
    if (state) applyShareState(state, map, cities);
  }, [map, cities]);

  // Live-write the hash after hydration.
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const write = () => {
      if (!hydratedRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const encoded = encodeState(collectShareState(map));
        history.replaceState(null, '', `#s=${encoded}`);
      }, 400);
    };
    const unsubs = [
      useCityStore.subscribe(write),
      useLayerStore.subscribe(write),
      useMapStore.subscribe(write),
      useIsochroneStore.subscribe(write),
      useRouteStore.subscribe(write),
      useDrawStore.subscribe(write),
    ];
    map.on('moveend', write);
    return () => {
      unsubs.forEach((u) => u());
      map.off('moveend', write);
      if (timer) clearTimeout(timer);
    };
  }, [map]);
}
```

- [ ] **Step 2: Call it in App** — in `cityscope/src/App.tsx`, import and call `useShareSync()` inside the `App` component (before the return):
```ts
import { useShareSync } from './hooks/useShareSync';
// ...inside App():
  useShareSync();
```

- [ ] **Step 3: MapView hydration guard** — in `cityscope/src/components/MapView.tsx`, import `isHydrating` from `../lib/shareState` and add, as the FIRST line inside the "fly to city on change" effect (the effect keyed on `selectedCity.id`), after it early-returns for `!map || !mapReady`:
```ts
    if (isHydrating()) return;
```
This stops the city-change `flyTo` + tool resets from overriding the state we're restoring.

- [ ] **Step 4: Build** — `npm run build` → passes.

- [ ] **Step 5: Commit**
```bash
git add cityscope/src/hooks/useShareSync.ts cityscope/src/App.tsx cityscope/src/components/MapView.tsx
git commit -m "feat(web): hydrate + live-sync map state to the URL hash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Copy-link button

**Files:** Create `cityscope/src/components/ShareButton.tsx`; modify `cityscope/src/components/Navbar.tsx`

- [ ] **Step 1: The button** — create `cityscope/src/components/ShareButton.tsx`:
```tsx
import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import ShareIcon from '@mui/icons-material/IosShare';
import { AMBER } from '../theme';

function ShareButton() {
  const [open, setOpen] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setOpen(true);
    } catch {
      setOpen(true); // still confirm; clipboard may be blocked in some contexts
    }
  };

  return (
    <>
      <Tooltip title="Copy link to this view">
        <IconButton
          onClick={handleShare}
          size="small"
          aria-label="Copy shareable link"
          sx={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0, '&:hover': { color: AMBER, background: `${AMBER}14` } }}
        >
          <ShareIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Snackbar
        open={open}
        autoHideDuration={2000}
        onClose={() => setOpen(false)}
        message="Link copied"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}

export default ShareButton;
```

- [ ] **Step 2: Mount it in the navbar** — in `cityscope/src/components/Navbar.tsx`, import `ShareButton` and render `<ShareButton />` inside the `Toolbar`, just before the 2D/3D segmented toggle (so it sits at the right cluster).

- [ ] **Step 3: Build** — `npm run build` → passes, no unused imports.

- [ ] **Step 4: Commit**
```bash
git add cityscope/src/components/ShareButton.tsx cityscope/src/components/Navbar.tsx
git commit -m "feat(web): navbar copy-link (share) button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Restore a drawn polygon onto the map

**Files:** Modify `cityscope/src/components/MapView.tsx`

When a shared link carries a `draw` tool, `drawStore.polygon` is set from the URL (not a draw event), so the shape must be re-added to the MapboxDraw control to be visible.

- [ ] **Step 1: Subscribe to the polygon** — with the other MapView store subscriptions add:
```ts
  const drawPolygon = useDrawStore((s) => s.polygon);
```

- [ ] **Step 2: Add an effect** — after the draw enable/disable lifecycle effect:
```ts
  // Render a polygon that arrived from a shared URL (draw control has no feature yet)
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !drawEnabled || !drawPolygon) return;
    if (draw.getAll().features.length > 0) return; // user-drawn shape already present
    draw.add({ type: 'Feature', properties: {}, geometry: drawPolygon });
    draw.changeMode('simple_select');
  }, [drawEnabled, drawPolygon]);
```
If `tsc` objects to the `draw.add` argument type, cast the feature literal to the mapbox-gl-draw feature type (do not use `any`). Keep the object shape as written.

- [ ] **Step 3: Build** — `npm run build` → passes.

- [ ] **Step 4: Commit**
```bash
git add cityscope/src/components/MapView.tsx
git commit -m "feat(map): render a shared drawn polygon on hydrate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1** — start backend + frontend; ensure data seeded.
- [ ] **Step 2 — round-trip a view:** pan/zoom to a spot, toggle some layers, enable 3D. Confirm the address bar hash updates (`#s=…`). Click **Share** → "Link copied". Open the copied link in a fresh tab → same city, view, layers, and 3D restored.
- [ ] **Step 3 — round-trip a tool:** enable Isochrone, click an origin; copy the link; open in a fresh tab → the isochrone is restored and re-rendered. Repeat for a **drawn area** (the polygon should re-appear on the map and the panel repopulate).
- [ ] **Step 4 — robustness:** manually corrupt the hash (change a few chars) and reload → app loads fresh, no crash, console clean (an optional warn is fine). Load with no hash → fresh defaults.

---

## Notes & deviations

- **Frontend Vitest is new** (Task 2) — the codec is the tested unit; `collect/applyShareState` and the hook are verified end-to-end (Task 7) since they touch the map/stores.
- **Hydration timing:** `applyShareState` sets a module-level `hydrating` flag that MapView's city-change effect checks, cleared on the next macrotask after React flushes that effect. This prevents the city auto-fly + tool resets from clobbering the restored state, and lets `jumpTo` set the exact saved view.
- **Not serialized:** selected feature, heatmap spotlight, sidebar open/closed, loading/error — transient by design.
