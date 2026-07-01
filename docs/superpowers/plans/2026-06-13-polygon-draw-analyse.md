# Polygon Draw & Analyse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users draw a polygon on the map and instantly see the POIs inside it (count, area km², density per km², top categories), computed server-side with a PostGIS `ST_Within` query.

**Architecture:** A new `POST /api/cities/:cityId/pois/within` endpoint runs `ST_Within` against the indexed `pois.geom` and returns aggregates. On the frontend, `@mapbox/mapbox-gl-draw` captures a polygon into a Zustand `drawStore`; a TanStack Query hook POSTs it; a sidebar `DrawControls` module renders the results. Draw is the third Analysis tool, mutually exclusive with Isochrone and Route.

**Tech Stack:** Express 5, `pg`, PostGIS (Neon), Vitest, React 19, TanStack Query 5, Zustand 5, MUI 7, `@mapbox/mapbox-gl-draw`, Mapbox GL JS 3.

**Prereqs already in place:** `pois.geom` generated column + GiST index (migration 002); `statsMath` helper + Vitest in the backend; the `VITE_API_URL` env; seeded data on Neon.

---

## File Structure

**Backend**
- `cityscope-backend/src/lib/geometry.ts` (new) — `isPolygonGeometry` request-body guard.
- `cityscope-backend/src/lib/geometry.test.ts` (new) — Vitest unit tests.
- `cityscope-backend/src/routes/pois.ts` (modify) — add `POST /within`.

**Frontend**
- `cityscope/package.json` (modify) — add `@mapbox/mapbox-gl-draw` + types.
- `cityscope/src/main.tsx` (modify) — import the draw CSS.
- `cityscope/src/store/drawStore.ts` (new) — enabled + polygon state.
- `cityscope/src/hooks/useAreaAnalysis.ts` (new) — query hook + `AreaStats` type.
- `cityscope/src/components/MapView.tsx` (modify) — MapboxDraw lifecycle + events + click guard.
- `cityscope/src/components/DrawControls.tsx` (new) — sidebar module + results.
- `cityscope/src/components/Sidebar.tsx` (modify) — mount the module.
- `cityscope/src/components/IsochroneControls.tsx`, `RouteControls.tsx` (modify) — disable Draw on enable.

---

## Task 1: Backend polygon validator (TDD)

**Files:**
- Create: `cityscope-backend/src/lib/geometry.ts`
- Test: `cityscope-backend/src/lib/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cityscope-backend/src/lib/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isPolygonGeometry } from './geometry';

const validPolygon = {
  type: 'Polygon',
  coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]],
};

describe('isPolygonGeometry', () => {
  it('accepts a valid closed polygon', () => {
    expect(isPolygonGeometry(validPolygon)).toBe(true);
  });
  it('rejects a non-Polygon type', () => {
    expect(isPolygonGeometry({ type: 'Point', coordinates: [13.4, 52.5] })).toBe(false);
  });
  it('rejects missing coordinates', () => {
    expect(isPolygonGeometry({ type: 'Polygon' })).toBe(false);
  });
  it('rejects a ring with too few positions', () => {
    expect(isPolygonGeometry({ type: 'Polygon', coordinates: [[[13.3, 52.5], [13.4, 52.5]]] })).toBe(false);
  });
  it('rejects null and non-objects', () => {
    expect(isPolygonGeometry(null)).toBe(false);
    expect(isPolygonGeometry('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails** — From `cityscope-backend`: `npm test` → FAIL (`./geometry` unresolved).

- [ ] **Step 3: Implement the validator**

Create `cityscope-backend/src/lib/geometry.ts`:
```ts
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Minimal structural check that an unknown value is a closed GeoJSON Polygon. */
export function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt: unknown) =>
      Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number',
  );
}
```

- [ ] **Step 4: Run the test, verify it passes** — `npm test` → all geometry + statsMath tests green. `npm run build` clean.

- [ ] **Step 5: Commit**
```bash
git add cityscope-backend/src/lib/geometry.ts cityscope-backend/src/lib/geometry.test.ts
git commit -m "test(backend): add GeoJSON polygon validator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend `POST /within` endpoint

**Files:** Modify `cityscope-backend/src/routes/pois.ts`

- [ ] **Step 1: Add imports** (below existing imports)
```ts
import { densityPerKm2 } from '../lib/statsMath.js';
import { isPolygonGeometry } from '../lib/geometry.js';
```

- [ ] **Step 2: Add the handler** (after the existing `poiRouter.get('/', ...)` handler)
```ts
poiRouter.post('/within', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';
    const polygon = (req.body as { polygon?: unknown }).polygon;

    if (!isPolygonGeometry(polygon)) {
      res.status(400).json({ error: 'Body must be { polygon: <GeoJSON Polygon> }' });
      return;
    }

    const result = await pool.query(
      `WITH poly AS (
         SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g
       ),
       inside AS (
         SELECT p.category
         FROM pois p, poly
         WHERE p.city_id = $2 AND ST_Within(p.geom, poly.g)
       )
       SELECT
         (SELECT count(*) FROM inside)                  AS poi_count,
         (SELECT ST_Area(g::geography) / 1e6 FROM poly) AS area_km2,
         COALESCE((
           SELECT json_agg(tc) FROM (
             SELECT category, count(*)::int AS count
             FROM inside GROUP BY category ORDER BY count(*) DESC LIMIT 5
           ) tc
         ), '[]'::json)                                 AS top_categories`,
      [JSON.stringify(polygon), cityId],
    );

    const row = result.rows[0];
    const poiCount = Number(row.poi_count);
    const areaKm2 = Number(row.area_km2);
    const density = densityPerKm2(poiCount, areaKm2);

    res.json({
      poiCount,
      areaKm2: Number(areaKm2.toFixed(3)),
      densityPerKm2: Number(density.toFixed(1)),
      topCategories: row.top_categories,
    });
  } catch (err) {
    console.error('Failed to analyse area:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Type-check** — `npm run build` → passes.

- [ ] **Step 4: Verify the endpoint live**
```bash
curl -sS -X POST http://localhost:3001/api/cities/berlin/pois/within \
  -H "Content-Type: application/json" \
  -d '{"polygon":{"type":"Polygon","coordinates":[[[13.36,52.50],[13.44,52.50],[13.44,52.54],[13.36,52.54],[13.36,52.50]]]}}'
```
Expected: `poiCount` > 0, an `areaKm2`, `densityPerKm2 ≈ poiCount/areaKm2`, a `topCategories` array. A `{"type":"Point"...}` body → `400`.

- [ ] **Step 5: Commit**
```bash
git add cityscope-backend/src/routes/pois.ts
git commit -m "feat(api): POIs-within-polygon analysis endpoint (ST_Within)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Add the drawing dependency

**Files:** Modify `cityscope/package.json` (via npm), `cityscope/src/main.tsx`

- [ ] **Step 1: Install** — from `cityscope`: `npm i @mapbox/mapbox-gl-draw` and `npm i -D @types/mapbox__mapbox-gl-draw` (latest 1.4.x+, supports GL JS v3).
- [ ] **Step 2: Import the stylesheet** — in `cityscope/src/main.tsx`, after the other imports:
```ts
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
```
- [ ] **Step 3: Verify** — `npm run build` succeeds (dep + types resolve). Runtime mount verified in Task 6/7.
- [ ] **Step 4: Commit**
```bash
git add cityscope/package.json cityscope/package-lock.json cityscope/src/main.tsx
git commit -m "build(web): add @mapbox/mapbox-gl-draw dependency

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Draw store

**Files:** Create `cityscope/src/store/drawStore.ts`

- [ ] **Step 1: Create the store**
```ts
import { create } from 'zustand';

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

interface DrawState {
  enabled: boolean;
  polygon: PolygonGeometry | null;
  setEnabled: (enabled: boolean) => void;
  setPolygon: (polygon: PolygonGeometry | null) => void;
  reset: () => void;
}

export const useDrawStore = create<DrawState>((set, get) => ({
  enabled: false,
  polygon: null,
  setEnabled: (enabled) => {
    if (!enabled) get().reset();
    set({ enabled });
  },
  setPolygon: (polygon) => set({ polygon }),
  reset: () => set({ polygon: null }),
}));
```
- [ ] **Step 2: Type-check** — `npm run build` passes.
- [ ] **Step 3: Commit**
```bash
git add cityscope/src/store/drawStore.ts
git commit -m "feat(web): draw store for polygon analysis tool

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Area analysis hook

**Files:** Create `cityscope/src/hooks/useAreaAnalysis.ts`

- [ ] **Step 1: Create the hook + type**
```ts
import { useQuery } from '@tanstack/react-query';
import type { PolygonGeometry } from '../store/drawStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface AreaCategoryCount {
  category: string;
  count: number;
}

export interface AreaStats {
  poiCount: number;
  areaKm2: number;
  densityPerKm2: number;
  topCategories: AreaCategoryCount[];
}

async function fetchAreaStats(
  cityId: string,
  polygon: PolygonGeometry,
): Promise<AreaStats> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/pois/within`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon }),
  });
  if (!res.ok) throw new Error(`Area analysis failed: ${res.status}`);
  return res.json() as Promise<AreaStats>;
}

export function useAreaAnalysis(cityId: string, polygon: PolygonGeometry | null) {
  return useQuery({
    queryKey: ['area-analysis', cityId, polygon ? JSON.stringify(polygon) : null],
    queryFn: () => fetchAreaStats(cityId, polygon as PolygonGeometry),
    enabled: polygon !== null,
    staleTime: 5 * 60 * 1000,
  });
}
```
- [ ] **Step 2: Type-check** — `npm run build` passes.
- [ ] **Step 3: Commit**
```bash
git add cityscope/src/hooks/useAreaAnalysis.ts
git commit -m "feat(web): useAreaAnalysis query hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: MapboxDraw integration in MapView

**Files:** Modify `cityscope/src/components/MapView.tsx`

This is the integration + compatibility work. If `@mapbox/mapbox-gl-draw` has a peer/typing/CSS quirk against GL JS v3 (e.g. the custom `draw.*` event names need a listener cast), resolve it here.

- [ ] **Step 1: Imports**
```ts
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useDrawStore } from '../store/drawStore';
import type { PolygonGeometry } from '../store/drawStore';
```
- [ ] **Step 2: Ref** (with the other `useRef`s): `const drawRef = useRef<MapboxDraw | null>(null);`
- [ ] **Step 3: Subscribe** (with the other store subs): `const drawEnabled = useDrawStore((s) => s.enabled);`
- [ ] **Step 4: Click guard** — first line of the `map.on('click', (e) => {` body: `if (useDrawStore.getState().enabled) return;`
- [ ] **Step 5: Draw event listeners** (in the init effect, after `addControl(NavigationControl)`):
```ts
    interface DrawChangeEvent {
      features: Array<{ id?: string | number; geometry: { type: string; coordinates: number[][][] } }>;
    }
    const readPolygon = (e: DrawChangeEvent) => {
      const geom = e.features[0]?.geometry;
      if (geom && geom.type === 'Polygon') {
        useDrawStore.getState().setPolygon(geom as PolygonGeometry);
      }
    };
    const handleDrawCreate = (e: DrawChangeEvent) => {
      const draw = drawRef.current;
      const created = e.features[0];
      if (draw && created) {
        draw.getAll().features.forEach((f) => {
          if (f.id !== created.id && f.id != null) draw.delete(String(f.id));
        });
      }
      readPolygon(e);
    };
    const handleDrawDelete = () => useDrawStore.getState().setPolygon(null);
    map.on('draw.create', handleDrawCreate as (e: object) => void);
    map.on('draw.update', readPolygon as (e: object) => void);
    map.on('draw.delete', handleDrawDelete);
```
If `tsc` rejects the custom event names, attach via `map.on('draw.create' as never, handleDrawCreate as never)` — keep handler bodies as written; no `any`.

- [ ] **Step 6: Enable/disable lifecycle effect**
```ts
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (drawEnabled) {
      if (!drawRef.current) {
        drawRef.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: { polygon: true, trash: true },
        });
      }
      if (!map.hasControl(drawRef.current)) {
        map.addControl(drawRef.current, 'top-right');
      }
      drawRef.current.changeMode('draw_polygon');
    } else if (drawRef.current && map.hasControl(drawRef.current)) {
      map.removeControl(drawRef.current);
      useDrawStore.getState().setPolygon(null);
    }
  }, [drawEnabled, mapReady]);
```
- [ ] **Step 7: Cleanup on unmount** (in the init effect cleanup, before `mapRef.current?.remove()`):
```ts
      if (drawRef.current && mapRef.current?.hasControl(drawRef.current)) {
        mapRef.current.removeControl(drawRef.current);
      }
      drawRef.current = null;
```
- [ ] **Step 8: Build gate** — `npm run build` passes. Runtime mount verified in Task 7 Step 6.
- [ ] **Step 9: Commit**
```bash
git add cityscope/src/components/MapView.tsx
git commit -m "feat(map): MapboxDraw polygon tool wired to draw store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: DrawControls UI, sidebar wiring, mutual exclusivity

**Files:** Create `cityscope/src/components/DrawControls.tsx`; modify `Sidebar.tsx`, `IsochroneControls.tsx`, `RouteControls.tsx`.

- [ ] **Step 1: Build the DrawControls module** — a sidebar module with an enable toggle (which disables Isochrone + Route via `getState().setEnabled(false)`), a hint while empty, a loading spinner, an inline error, and on data: POI/Area/Density stats plus top-category chips (or "No POIs in this area." when count is 0). Reads `cityId` from `useCityStore` and calls `useAreaAnalysis(cityId, polygon)`.
- [ ] **Step 2: Mount it in the Sidebar** — import `DrawControls` + `useDrawStore`, add `const drawEnabled = useDrawStore((s) => s.enabled);`, and add a third `<ModuleCard active={drawEnabled}><DrawControls /></ModuleCard>` after the Route card.
- [ ] **Step 3: Isochrone disables Draw** — in `IsochroneControls.tsx` `handleToggle`'s `if (checked)` block add `useDrawStore.getState().setEnabled(false);` (+ import).
- [ ] **Step 4: Route disables Draw** — same edit in `RouteControls.tsx`.
- [ ] **Step 5: Build** — `npm run build` passes, no unused imports.
- [ ] **Step 6: End-to-end manual verification** — start the frontend; select Berlin; toggle **Draw Area** on (Isochrone/Route switch off). **Compatibility gate:** the polygon/trash draw buttons appear and the console shows no `@mapbox/mapbox-gl-draw` errors — resolve any GL-JS-v3 quirk here. Draw a polygon (click vertices, double-click to close) → the module shows POIs/Area/Density + chips. Redraw replaces; toggle off clears.
- [ ] **Step 7: Commit**
```bash
git add cityscope/src/components/DrawControls.tsx cityscope/src/components/Sidebar.tsx cityscope/src/components/IsochroneControls.tsx cityscope/src/components/RouteControls.tsx
git commit -m "feat(web): draw-area analysis module + tool exclusivity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes & deviations

- **Gold theming of the drawn polygon is omitted for reliability.** MapboxDraw uses default styling (works out of the box against GL JS v3). A custom `styles` array to recolour it amber is a bounded follow-up.
- **Tests:** the unit-tested unit is `isPolygonGeometry` (Vitest). The spatial SQL is verified by curl against seeded data (Task 2); the UI is verified manually in the browser (Task 7).
- **Post-plan UX refinements** (not in the original plan, applied during/after build): the draw control was moved to `top-right` so the open sidebar doesn't cover it; the built-in trash button was replaced with a sidebar "Clear area" button driven by a `drawStore` clear signal; draw mode auto re-arms after a shape completes; the empty-state hint was clarified to "Click points on the map, double-click to finish."
