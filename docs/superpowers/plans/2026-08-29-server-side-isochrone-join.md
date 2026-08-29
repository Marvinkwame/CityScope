# Server-Side Isochrone POI Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the isochrone POI-in-band join from client-side Turf.js into PostGIS, and stop the app downloading every POI in the city on page load.

**Architecture:** The client keeps fetching isochrone polygons from Mapbox and keeps rendering them unchanged. A new hook posts the contour geometries to `POST /api/cities/:cityId/pois/in-isochrone`, which unnests them in SQL and spatial-joins each against the GiST-indexed `pois.geom` with `ST_Within`. Spatial work happens in SQL; derived shaping happens in pure, unit-tested TypeScript. With the join server-side, `usePois` is gated behind the heatmap layer so the bulk POI fetch no longer happens on load.

**Tech Stack:** Backend — Node, TypeScript (NodeNext ESM via `tsx`), Express 5, PostgreSQL + PostGIS (`pg`) on Neon, Vitest. Frontend — React 19, TypeScript, Vite 8, Mapbox GL JS 3, TanStack Query 5, Zustand 5, MUI 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-server-side-isochrone-join-design.md`

## Global Constraints

- Strict TypeScript, **no `any`**. Type-only imports use `import type`.
- Backend is **NodeNext ESM**: every relative import carries a `.js` extension (e.g. `import pool from '../db.js'`).
- Commits are **granular, one concern each, with NO `Co-Authored-By` trailer**.
- Test files are named `*.test.ts` — never `*.test.tsx`. Both `tsconfig.json` (backend) and `tsconfig.app.json` (frontend) exclude `src/**/*.test.ts` from the build, and a `.tsx` test would break `npm run build`.
- Maximum **6** contour entries accepted per request.
- Malformed request bodies return **400, never 500**.
- Use **`ST_Within`**, not `ST_Covers`, for consistency with the existing `/pois/within` endpoint.
- **Cumulative band semantics:** each contour polygon is tested independently, so a POI inside the 5-minute band also appears in the 10- and 15-minute bands. Do not "optimise" this into exclusive rings — it would change every number in the UI.
- **Do not start a frontend dev server.** The owner runs his own on :5173 and backend CORS is pinned to that origin; a preview server on another port breaks CORS. Verify the backend with `curl` on :3001 and hand live browser checks to the owner.
- MUI styling uses the `sx` prop. Theme tokens come from `src/theme.ts` (`AMBER`, `CYAN`, `MONO`).

## File Structure

**Backend (`cityscope-backend/`)**

| File | Action | Responsibility |
|---|---|---|
| `src/lib/geometry.ts` | Modify | Add `MultiPolygon` support, `ContourInput` type, and the `isContourInputArray` guard alongside the existing `isPolygonGeometry` |
| `src/lib/geometry.test.ts` | Modify | Tests for the new guards |
| `src/lib/isochroneBands.ts` | Create | Pure `groupPoisByBand` — turns flat SQL rows into per-band results |
| `src/lib/isochroneBands.test.ts` | Create | Tests for `groupPoisByBand` |
| `src/routes/pois.ts` | Modify | Add `POST /in-isochrone` |
| `src/index.ts` | Modify | Explicit `express.json` body limit |

**Frontend (`cityscope/`)**

| File | Action | Responsibility |
|---|---|---|
| `src/lib/isochronePayload.ts` | Create | Pure `toContourPayload` — Mapbox FeatureCollection → our request contract |
| `src/lib/isochronePayload.test.ts` | Create | Tests for `toContourPayload` |
| `src/hooks/useIsochronePois.ts` | Create | TanStack query wrapping the new endpoint |
| `src/components/IsochroneResultsPanel.tsx` | Modify | Consume the new hook; add loading and error states |
| `src/hooks/useIsochroneResults.ts` | Delete | The client-side Turf join, superseded |
| `src/hooks/usePois.ts` | Modify | Gate the bulk fetch behind `layers.heatmap` |
| `src/components/Sidebar.tsx` | Modify | Spinner on the POI Heatmap row while POIs fetch |
| `package.json` | Modify | Remove `@turf/boolean-point-in-polygon` and `@turf/helpers` |

**Branch:** create a fresh branch off `main` — `feat/server-side-isochrone-join` from the spec phase is redundant (its only commit is already on `main`).

```bash
git checkout main && git pull && git checkout -b feat/isochrone-postgis-join
```

---

### Task 1: Backend — contour input validation guard

**Files:**
- Modify: `cityscope-backend/src/lib/geometry.ts`
- Test: `cityscope-backend/src/lib/geometry.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `interface MultiPolygonGeometry { type: 'MultiPolygon'; coordinates: number[][][][] }`
  - `type AreaGeometry = PolygonGeometry | MultiPolygonGeometry`
  - `interface ContourInput { contour: number; geometry: AreaGeometry }`
  - `function isAreaGeometry(value: unknown): value is AreaGeometry`
  - `function isContourInputArray(value: unknown): value is ContourInput[]`
  - `const MAX_CONTOURS = 6` (exported)

- [ ] **Step 1: Write the failing tests**

Append to `cityscope-backend/src/lib/geometry.test.ts`, and add `isContourInputArray` and `isAreaGeometry` to the existing import on line 2:

```typescript
import { isPolygonGeometry, isAreaGeometry, isContourInputArray } from './geometry';

const validMultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]]],
};

describe('isAreaGeometry', () => {
  it('accepts a Polygon', () => {
    expect(isAreaGeometry(validPolygon)).toBe(true);
  });
  it('accepts a MultiPolygon', () => {
    expect(isAreaGeometry(validMultiPolygon)).toBe(true);
  });
  it('rejects a Point', () => {
    expect(isAreaGeometry({ type: 'Point', coordinates: [13.4, 52.5] })).toBe(false);
  });
  it('rejects a MultiPolygon whose inner ring is too short', () => {
    expect(isAreaGeometry({ type: 'MultiPolygon', coordinates: [[[[13.3, 52.5], [13.4, 52.5]]]] })).toBe(false);
  });
});

describe('isContourInputArray', () => {
  const entry = { contour: 5, geometry: validPolygon };

  it('accepts a single valid entry', () => {
    expect(isContourInputArray([entry])).toBe(true);
  });
  it('accepts three valid entries', () => {
    expect(isContourInputArray([entry, { contour: 10, geometry: validPolygon }, { contour: 15, geometry: validMultiPolygon }])).toBe(true);
  });
  it('rejects a non-array', () => {
    expect(isContourInputArray({ contour: 5, geometry: validPolygon })).toBe(false);
  });
  it('rejects an empty array', () => {
    expect(isContourInputArray([])).toBe(false);
  });
  it('rejects more than 6 entries', () => {
    expect(isContourInputArray(Array.from({ length: 7 }, (_, i) => ({ contour: i + 1, geometry: validPolygon })))).toBe(false);
  });
  it('rejects a missing contour', () => {
    expect(isContourInputArray([{ geometry: validPolygon }])).toBe(false);
  });
  it('rejects a non-integer contour', () => {
    expect(isContourInputArray([{ contour: 7.5, geometry: validPolygon }])).toBe(false);
  });
  it('rejects a contour that is a numeric string', () => {
    expect(isContourInputArray([{ contour: '5', geometry: validPolygon }])).toBe(false);
  });
  it('rejects a bad geometry', () => {
    expect(isContourInputArray([{ contour: 5, geometry: { type: 'Point', coordinates: [13.4, 52.5] } }])).toBe(false);
  });
  it('rejects null entries', () => {
    expect(isContourInputArray([null])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd cityscope-backend && npx vitest run src/lib/geometry.test.ts
```

Expected: FAIL. The import of `isAreaGeometry` / `isContourInputArray` cannot be resolved, so the whole file errors before any assertion runs.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `cityscope-backend/src/lib/geometry.ts`. Note that `isPolygonGeometry` keeps its exact previous behaviour — it is only rewritten to share the new `isRing` helper, so the five existing tests must still pass.

```typescript
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** One isochrone contour: the travel time in minutes plus its reachable area. */
export interface ContourInput {
  contour: number;
  geometry: AreaGeometry;
}

/** Upper bound on contours per request — Mapbox itself caps at 4, this leaves headroom. */
export const MAX_CONTOURS = 6;

/** A linear ring: at least 4 positions, each a [lng, lat] number pair. */
function isRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false;
  return value.every(
    (pt: unknown) =>
      Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number',
  );
}

/** Minimal structural check that an unknown value is a closed GeoJSON Polygon. */
export function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  return isRing(g.coordinates[0]);
}

/**
 * Accepts Polygon or MultiPolygon. Mapbox does not currently return
 * MultiPolygon with polygons=true, but ST_Within is indifferent to the
 * distinction and the old client-side join already handled both.
 */
export function isAreaGeometry(value: unknown): value is AreaGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  if (g.type === 'Polygon') return isRing(g.coordinates[0]);
  if (g.type === 'MultiPolygon') {
    return g.coordinates.every(
      (poly: unknown) => Array.isArray(poly) && poly.length > 0 && isRing(poly[0]),
    );
  }
  return false;
}

/** Validates the `contours` array of an /in-isochrone request body. */
export function isContourInputArray(value: unknown): value is ContourInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CONTOURS) return false;
  return value.every((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const c = entry as { contour?: unknown; geometry?: unknown };
    return Number.isInteger(c.contour) && isAreaGeometry(c.geometry);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd cityscope-backend && npm test
```

Expected: PASS — 2 test files, 25 tests (10 pre-existing + 15 new). Confirm the 5 original `isPolygonGeometry` tests still pass; that proves the `isRing` refactor did not change its behaviour.

- [ ] **Step 5: Commit**

```bash
git add cityscope-backend/src/lib/geometry.ts cityscope-backend/src/lib/geometry.test.ts
git commit -m "feat(api): validate isochrone contour input geometry"
```

---

### Task 2: Backend — group flat SQL rows into bands

**Files:**
- Create: `cityscope-backend/src/lib/isochroneBands.ts`
- Test: `cityscope-backend/src/lib/isochroneBands.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent pure module)
- Produces:
  - `interface BandPoi { id: number; name: string | null; category: string; lat: number; lng: number }`
  - `interface BandRow extends BandPoi { contour: number }`
  - `interface IsochroneBand { contour: number; poiCount: number; categoryCounts: Record<string, number>; pois: BandPoi[] }`
  - `function groupPoisByBand(rows: BandRow[], contours: number[]): IsochroneBand[]`

**Why `contours` is a second parameter:** the SQL `JOIN` returns no rows for a contour containing zero POIs, so that band would silently vanish from the UI. Seeding the map from the requested contour list guarantees every requested band comes back, empty or not — the panel needs it to render its "No POIs in dataset" branch.

- [ ] **Step 1: Write the failing tests**

Create `cityscope-backend/src/lib/isochroneBands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { groupPoisByBand, type BandRow } from './isochroneBands';

const row = (contour: number, id: number, category: string): BandRow => ({
  contour,
  id,
  name: `POI ${id}`,
  category,
  lat: 52.5,
  lng: 13.4,
});

describe('groupPoisByBand', () => {
  it('groups rows by contour, ascending', () => {
    const bands = groupPoisByBand([row(10, 2, 'cafe'), row(5, 1, 'cafe')], [5, 10]);
    expect(bands.map((b) => b.contour)).toEqual([5, 10]);
  });

  it('counts POIs per band', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe'), row(5, 2, 'bar')], [5]);
    expect(bands[0].poiCount).toBe(2);
    expect(bands[0].pois).toHaveLength(2);
  });

  it('tallies categories per band', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe'), row(5, 2, 'cafe'), row(5, 3, 'bar')], [5]);
    expect(bands[0].categoryCounts).toEqual({ cafe: 2, bar: 1 });
  });

  it('keeps cumulative duplication across bands', () => {
    // The same POI inside both the 5- and 10-minute polygons appears in both.
    const bands = groupPoisByBand([row(5, 1, 'cafe'), row(10, 1, 'cafe')], [5, 10]);
    expect(bands[0].poiCount).toBe(1);
    expect(bands[1].poiCount).toBe(1);
  });

  it('returns a requested contour with no rows as an empty band', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe')], [5, 10, 15]);
    expect(bands).toHaveLength(3);
    expect(bands[2]).toEqual({ contour: 15, poiCount: 0, categoryCounts: {}, pois: [] });
  });

  it('returns an empty band per contour when there are no rows at all', () => {
    expect(groupPoisByBand([], [5, 10])).toEqual([
      { contour: 5, poiCount: 0, categoryCounts: {}, pois: [] },
      { contour: 10, poiCount: 0, categoryCounts: {}, pois: [] },
    ]);
  });

  it('includes a row whose contour was not requested', () => {
    const bands = groupPoisByBand([row(20, 1, 'cafe')], [5]);
    expect(bands.map((b) => b.contour)).toEqual([5, 20]);
  });

  it('strips the contour field from returned POIs', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe')], [5]);
    expect(bands[0].pois[0]).toEqual({ id: 1, name: 'POI 1', category: 'cafe', lat: 52.5, lng: 13.4 });
  });

  it('preserves a null POI name', () => {
    const bands = groupPoisByBand([{ ...row(5, 1, 'cafe'), name: null }], [5]);
    expect(bands[0].pois[0].name).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd cityscope-backend && npx vitest run src/lib/isochroneBands.test.ts
```

Expected: FAIL — `Failed to resolve import "./isochroneBands"`.

- [ ] **Step 3: Write the implementation**

Create `cityscope-backend/src/lib/isochroneBands.ts`:

```typescript
export interface BandPoi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

/** One row as returned by the /in-isochrone SQL query. */
export interface BandRow extends BandPoi {
  contour: number;
}

export interface IsochroneBand {
  contour: number;
  poiCount: number;
  categoryCounts: Record<string, number>;
  pois: BandPoi[];
}

function emptyBand(contour: number): IsochroneBand {
  return { contour, poiCount: 0, categoryCounts: {}, pois: [] };
}

/**
 * Turns flat (contour, poi) rows into one entry per band, ascending by contour.
 *
 * `contours` is the list the caller asked for. Seeding from it matters: the SQL
 * join emits no rows for a contour containing zero POIs, and the UI still needs
 * that band present so it can render its empty state.
 *
 * Bands are cumulative — a POI inside the 5-minute polygon is also inside the
 * 10-minute one and is counted in both. That mirrors the client-side behaviour
 * this replaced.
 */
export function groupPoisByBand(rows: BandRow[], contours: number[]): IsochroneBand[] {
  const byContour = new Map<number, IsochroneBand>();

  for (const contour of contours) {
    byContour.set(contour, emptyBand(contour));
  }

  for (const { contour, ...poi } of rows) {
    let band = byContour.get(contour);
    if (!band) {
      band = emptyBand(contour);
      byContour.set(contour, band);
    }
    band.pois.push(poi);
    band.poiCount += 1;
    band.categoryCounts[poi.category] = (band.categoryCounts[poi.category] ?? 0) + 1;
  }

  return [...byContour.values()].sort((a, b) => a.contour - b.contour);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd cityscope-backend && npm test
```

Expected: PASS — 3 test files, 34 tests.

- [ ] **Step 5: Commit**

```bash
git add cityscope-backend/src/lib/isochroneBands.ts cityscope-backend/src/lib/isochroneBands.test.ts
git commit -m "feat(api): group isochrone POI rows into contour bands"
```

---

### Task 3: Backend — the `/in-isochrone` endpoint

**Files:**
- Modify: `cityscope-backend/src/routes/pois.ts`
- Modify: `cityscope-backend/src/index.ts:14`

**Interfaces:**
- Consumes: `isContourInputArray` from Task 1 (the guard narrows the body, so `ContourInput` needs no explicit import); `groupPoisByBand`, `type BandRow` from Task 2
- Produces: `POST /api/cities/:cityId/pois/in-isochrone` returning `{ bands: IsochroneBand[] }`

This task has no unit test — the project has no database fixture, so the SQL is verified by `curl` against a live server. That gap is deliberate and recorded in the spec.

- [ ] **Step 1: Add the endpoint**

In `cityscope-backend/src/routes/pois.ts`, extend the imports at the top:

```typescript
import { isPolygonGeometry, isContourInputArray } from '../lib/geometry.js';
import { groupPoisByBand, type BandRow } from '../lib/isochroneBands.js';
```

Then append this handler to the end of the file, after the existing `/within` route:

```typescript
poiRouter.post('/in-isochrone', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';
    const contours = (req.body as { contours?: unknown }).contours;

    if (!isContourInputArray(contours)) {
      res.status(400).json({
        error: 'Body must be { contours: [{ contour: <integer>, geometry: <GeoJSON Polygon|MultiPolygon> }] }, 1-6 entries',
      });
      return;
    }

    const result = await pool.query(
      `WITH bands AS (
         SELECT (c->>'contour')::int AS contour,
                ST_SetSRID(ST_GeomFromGeoJSON(c->'geometry'), 4326) AS g
         FROM jsonb_array_elements($1::jsonb) AS c
       )
       SELECT b.contour, p.id, p.name, p.category, p.lat, p.lng
       FROM bands b
       JOIN pois p ON p.city_id = $2 AND ST_Within(p.geom, b.g)
       ORDER BY b.contour, p.category, p.name`,
      [JSON.stringify(contours), cityId],
    );

    const rows: BandRow[] = result.rows.map((r) => ({
      contour: Number(r.contour),
      id: Number(r.id),
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));

    res.json({ bands: groupPoisByBand(rows, contours.map((c) => c.contour)) });
  } catch (err) {
    // A geometry that passes the structural guard can still be rejected by
    // ST_GeomFromGeoJSON (e.g. a self-intersecting ring). Treat that as a
    // client error rather than a 500.
    const message = err instanceof Error ? err.message : '';
    if (/GeoJSON|geometry|invalid/i.test(message)) {
      res.status(400).json({ error: 'Invalid contour geometry' });
      return;
    }
    console.error('Failed to analyse isochrone bands:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Set an explicit body limit**

In `cityscope-backend/src/index.ts`, replace line 14:

```typescript
app.use(express.json());
```

with:

```typescript
// Isochrone contour payloads are small (measured: 3 KB walking, 27 KB for a
// 30-minute driving isochrone) but the 100 KB default leaves little headroom,
// so state the limit explicitly.
app.use(express.json({ limit: '512kb' }));
```

- [ ] **Step 3: Verify the build and existing tests still pass**

```bash
cd cityscope-backend && npm run build && npm test
```

Expected: build succeeds with no output; tests PASS — 3 files, 34 tests.

- [ ] **Step 4: Start the dev server**

```bash
cd cityscope-backend && npm run dev
```

Expected: `Server running on port 3001`. Leave it running for the next steps.

- [ ] **Step 5: Verify the happy path with curl**

A small triangle-ish box over central Berlin, two contours:

```bash
curl -s -X POST http://localhost:3001/api/cities/berlin/pois/in-isochrone -H "Content-Type: application/json" -d '{"contours":[{"contour":5,"geometry":{"type":"Polygon","coordinates":[[[13.40,52.51],[13.42,52.51],[13.42,52.53],[13.40,52.53],[13.40,52.51]]]}},{"contour":10,"geometry":{"type":"Polygon","coordinates":[[[13.38,52.50],[13.44,52.50],[13.44,52.54],[13.38,52.54],[13.38,52.50]]]}}]}' | head -c 400
```

Expected: a JSON object starting `{"bands":[{"contour":5,"poiCount":`. Confirm three things: `poiCount` for contour 5 is smaller than for contour 10 (the smaller box is inside the larger); `categoryCounts` is a non-empty object; and each entry in `pois` has `id`, `name`, `category`, `lat`, `lng`.

- [ ] **Step 6: Verify an empty band comes back rather than disappearing**

A box in the North Sea, containing no POIs:

```bash
curl -s -X POST http://localhost:3001/api/cities/berlin/pois/in-isochrone -H "Content-Type: application/json" -d '{"contours":[{"contour":5,"geometry":{"type":"Polygon","coordinates":[[[3.0,56.0],[3.1,56.0],[3.1,56.1],[3.0,56.1],[3.0,56.0]]]}}]}'
```

Expected exactly: `{"bands":[{"contour":5,"poiCount":0,"categoryCounts":{},"pois":[]}]}`

- [ ] **Step 7: Verify the validation returns 400, never 500**

```bash
curl -s -o /dev/null -w "no body: %{http_code}\n" -X POST http://localhost:3001/api/cities/berlin/pois/in-isochrone -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "empty contours: %{http_code}\n" -X POST http://localhost:3001/api/cities/berlin/pois/in-isochrone -H "Content-Type: application/json" -d '{"contours":[]}'
curl -s -o /dev/null -w "point geometry: %{http_code}\n" -X POST http://localhost:3001/api/cities/berlin/pois/in-isochrone -H "Content-Type: application/json" -d '{"contours":[{"contour":5,"geometry":{"type":"Point","coordinates":[13.4,52.5]}}]}'
curl -s -o /dev/null -w "no contour field: %{http_code}\n" -X POST http://localhost:3001/api/cities/berlin/pois/in-isochrone -H "Content-Type: application/json" -d '{"contours":[{"geometry":{"type":"Polygon","coordinates":[[[13.4,52.5],[13.42,52.5],[13.42,52.52],[13.4,52.5]]]}}]}'
```

Expected: all four print `400`. If any prints `500`, the guard is not catching that shape — fix before continuing.

- [ ] **Step 8: Commit**

```bash
git add cityscope-backend/src/routes/pois.ts cityscope-backend/src/index.ts
git commit -m "feat(api): add POST /pois/in-isochrone with PostGIS ST_Within join"
```

---

### Task 4: Frontend — map Mapbox contours to the request contract

**Files:**
- Create: `cityscope/src/lib/isochronePayload.ts`
- Test: `cityscope/src/lib/isochronePayload.test.ts`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces:
  - `interface ContourPayloadEntry { contour: number; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }`
  - `function toContourPayload(fc: GeoJSON.FeatureCollection | undefined): ContourPayloadEntry[]`

- [ ] **Step 1: Write the failing tests**

Create `cityscope/src/lib/isochronePayload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toContourPayload } from './isochronePayload';

const polygon: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]],
};

const feature = (contour: number): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { contour },
  geometry: polygon,
});

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

describe('toContourPayload', () => {
  it('maps features to contour entries', () => {
    expect(toContourPayload(fc([feature(5)]))).toEqual([{ contour: 5, geometry: polygon }]);
  });

  it('sorts ascending by contour', () => {
    const out = toContourPayload(fc([feature(15), feature(5), feature(10)]));
    expect(out.map((e) => e.contour)).toEqual([5, 10, 15]);
  });

  it('drops features that are not polygonal', () => {
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: { contour: 5 },
      geometry: { type: 'Point', coordinates: [13.4, 52.5] },
    };
    expect(toContourPayload(fc([point, feature(10)]))).toEqual([{ contour: 10, geometry: polygon }]);
  });

  it('keeps MultiPolygon features', () => {
    const multi: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [polygon.coordinates] };
    const out = toContourPayload(fc([{ type: 'Feature', properties: { contour: 5 }, geometry: multi }]));
    expect(out).toEqual([{ contour: 5, geometry: multi }]);
  });

  it('returns an empty array for undefined input', () => {
    expect(toContourPayload(undefined)).toEqual([]);
  });

  it('returns an empty array for a collection with no features', () => {
    expect(toContourPayload(fc([]))).toEqual([]);
  });

  it('defaults a missing contour property to 0', () => {
    const noProps: GeoJSON.Feature = { type: 'Feature', properties: null, geometry: polygon };
    expect(toContourPayload(fc([noProps]))).toEqual([{ contour: 0, geometry: polygon }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd cityscope && npx vitest run src/lib/isochronePayload.test.ts
```

Expected: FAIL — `Failed to resolve import "./isochronePayload"`.

- [ ] **Step 3: Write the implementation**

Create `cityscope/src/lib/isochronePayload.ts`:

```typescript
export interface ContourPayloadEntry {
  contour: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/**
 * Maps a Mapbox Isochrone FeatureCollection into our own request contract.
 *
 * Keeping this translation on the client means the API contract does not track
 * Mapbox's response format — if their payload shape changes, only this function
 * moves.
 */
export function toContourPayload(
  fc: GeoJSON.FeatureCollection | undefined,
): ContourPayloadEntry[] {
  if (!fc?.features) return [];

  return fc.features
    .filter(
      (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
        f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
    )
    .map((f) => ({
      contour: Number(f.properties?.contour ?? 0),
      geometry: f.geometry,
    }))
    .sort((a, b) => a.contour - b.contour);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd cityscope && npm test
```

Expected: PASS — 2 test files, 13 tests (6 pre-existing `shareCodec` + 7 new).

- [ ] **Step 5: Commit**

```bash
git add cityscope/src/lib/isochronePayload.ts cityscope/src/lib/isochronePayload.test.ts
git commit -m "test(web): add isochrone contour payload mapper"
```

---

### Task 5: Frontend — the `useIsochronePois` query hook

**Files:**
- Create: `cityscope/src/hooks/useIsochronePois.ts`

**Interfaces:**
- Consumes: `toContourPayload`, `type ContourPayloadEntry` from Task 4
- Produces:
  - `interface IsochroneBandResult { contour: number; poiCount: number; categoryCounts: Record<string, number>; pois: BandPoi[] }`
  - `interface BandPoi { id: number; name: string | null; category: string; lat: number; lng: number }`
  - `function useIsochronePois(isochroneData: GeoJSON.FeatureCollection | undefined)` — a TanStack query whose `data` is `IsochroneBandResult[]`

- [ ] **Step 1: Write the hook**

Create `cityscope/src/hooks/useIsochronePois.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { toContourPayload, type ContourPayloadEntry } from '../lib/isochronePayload';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface BandPoi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

export interface IsochroneBandResult {
  contour: number;
  poiCount: number;
  categoryCounts: Record<string, number>;
  pois: BandPoi[];
}

async function fetchIsochronePois(
  cityId: string,
  contours: ContourPayloadEntry[],
): Promise<IsochroneBandResult[]> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/pois/in-isochrone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contours }),
  });
  if (!res.ok) throw new Error(`Isochrone POI query failed: ${res.status}`);
  const json = (await res.json()) as { bands: IsochroneBandResult[] };
  return json.bands;
}

/**
 * Server-side POI-in-band join. Keyed on the same inputs that determine the
 * isochrone itself rather than on a hash of the geometry — cheaper and legible
 * in devtools.
 *
 * That is safe because useIsochrone keys on those same inputs and does not use
 * placeholderData, so its data goes undefined when the key changes. The
 * !!isochroneData guard therefore prevents posting the previous origin's
 * polygons under a new key.
 */
export function useIsochronePois(isochroneData: GeoJSON.FeatureCollection | undefined) {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const enabled = useIsochroneStore((s) => s.enabled);
  const origin = useIsochroneStore((s) => s.origin);
  const profile = useIsochroneStore((s) => s.profile);
  const contourMinutes = useIsochroneStore((s) => s.contourMinutes);

  return useQuery({
    queryKey: [
      'isochrone-pois',
      cityId,
      origin?.lng,
      origin?.lat,
      profile,
      contourMinutes.join(','),
    ],
    queryFn: () => fetchIsochronePois(cityId, toContourPayload(isochroneData)),
    enabled: enabled && origin !== null && !!isochroneData,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
cd cityscope && npx tsc -b
```

Expected: no output (success). The hook is not yet imported anywhere, so `noUnusedLocals` does not complain about an unused module — only unused locals inside it.

- [ ] **Step 3: Run lint**

```bash
cd cityscope && npm run lint
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add cityscope/src/hooks/useIsochronePois.ts
git commit -m "feat(web): add server-side isochrone POI query hook"
```

---

### Task 6: Frontend — switch the panel to server results

**Files:**
- Modify: `cityscope/src/components/IsochroneResultsPanel.tsx`

**Interfaces:**
- Consumes: `useIsochronePois` from Task 5 (band types are inferred from the hook's return, so no explicit type import)
- Produces: nothing consumed by later tasks

**Do Step 1 before changing any code.** It captures the numbers the current client-side join produces, which is the only way to tell afterwards whether the rewrite changed behaviour.

- [ ] **Step 1: Capture the baseline from the current client-side join**

Ask the owner to do this in his own browser on :5173 (do not start a server):

> Enable Isochrone, set profile **walking** and contours **5/10/15**, click the map at approximately **13.405, 52.520** (central Berlin). Expand all three bands and report the "N places" count for each.

Record the three numbers here before proceeding:

```
baseline walking 5/10/15 @ 13.405,52.520 — 5 min: ____   10 min: ____   15 min: ____
```

- [ ] **Step 2: Rewrite the panel's data wiring**

In `cityscope/src/components/IsochroneResultsPanel.tsx`, remove these two imports:

```typescript
import { useIsochroneResults } from '../hooks/useIsochroneResults';
import { usePois } from '../hooks/usePois';
```

and add:

```typescript
import CircularProgress from '@mui/material/CircularProgress';
import { useIsochronePois } from '../hooks/useIsochronePois';
```

Then replace this block inside the component:

```typescript
  const { data: isochroneData } = useIsochrone();
  const { data: poisData } = usePois();

  const bands = useIsochroneResults(isochroneData, poisData);

  const hasResults = enabled && origin !== null && !loading && bands.length > 0;

  if (!hasResults) return null;
```

with:

```typescript
  const { data: isochroneData } = useIsochrone();
  const { data: bands, isLoading: bandsLoading, isError: bandsError } = useIsochronePois(isochroneData);

  // The tool is live but the Mapbox stage has not resolved yet — stay hidden.
  if (!enabled || origin === null || loading) return null;

  // Second async stage. Without this the whole panel would vanish while the
  // join is in flight, which reads as the feature being broken.
  if (bandsLoading) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={18} sx={{ color: ISOCHRONE_COLOR }} />
        </Box>
      </Box>
    );
  }

  if (bandsError) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="caption" sx={{ color: 'error.main' }}>
          Couldn't analyse reachable places.
        </Typography>
      </Box>
    );
  }

  if (!bands || bands.length === 0) return null;
```

- [ ] **Step 3: Use the server's count and category tallies**

Still in the same file, inside the `bands.map(...)` callback, replace:

```typescript
        const topCategories = Object.entries(band.categoryCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4);
```

That line needs no change — `categoryCounts` has the same shape from the server. But replace both uses of `band.pois.length` in the summary row:

```typescript
                  {band.pois.length} place{band.pois.length !== 1 ? 's' : ''}
```

with the server-authoritative count:

```typescript
                  {band.poiCount} place{band.poiCount !== 1 ? 's' : ''}
```

and replace the two remaining `band.pois.length > 0` / `band.pois.length === 0` conditions with `band.poiCount > 0` and `band.poiCount === 0` respectively. Leave `band.pois.map(...)` in the `AccordionDetails` as it is — that still iterates the returned rows.

- [ ] **Step 4: Verify build, lint and tests**

```bash
cd cityscope && npx tsc -b && npm run lint && npm test
```

Expected: `tsc -b` and `lint` produce no output; tests PASS — 2 files, 13 tests.

- [ ] **Step 5: Compare against the baseline**

Ask the owner to repeat the exact interaction from Step 1 and report the three counts.

Expected: the same three numbers, or within one or two POIs of them. A small discrepancy is **correct, not a bug**: Turf's `booleanPointInPolygon` counts points exactly on the polygon boundary as inside (`ignoreBoundary` defaults to false), while `ST_Within` excludes boundary points. A difference of more than a few POIs, or any band that changed by a large margin, means something is actually wrong — stop and investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add cityscope/src/components/IsochroneResultsPanel.tsx
git commit -m "feat(web): read isochrone band results from the API"
```

---

### Task 7: Frontend — delete the client-side join

**Files:**
- Delete: `cityscope/src/hooks/useIsochroneResults.ts`
- Modify: `cityscope/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Confirm nothing still imports the old hook or the two Turf packages**

```bash
cd cityscope && grep -rn "useIsochroneResults\|boolean-point-in-polygon\|@turf/helpers" src/
```

Expected: no output. If anything is listed, Task 6 is incomplete — fix that first. `@turf/distance` will not appear here and must be kept; it powers the 300 m heatmap spotlight.

- [ ] **Step 2: Delete the hook**

```bash
cd cityscope && rm src/hooks/useIsochroneResults.ts
```

- [ ] **Step 3: Remove the two dependencies**

```bash
cd cityscope && npm uninstall @turf/boolean-point-in-polygon @turf/helpers
```

Expected: `package.json` keeps `@turf/distance` and loses the other two.

- [ ] **Step 4: Verify the build still passes without them**

```bash
cd cityscope && npx tsc -b && npm run lint && npm test && npm run build
```

Expected: all four produce success; `npm run build` ends with a Vite bundle summary. This is the step that proves nothing depended on the removed packages.

- [ ] **Step 5: Commit**

```bash
git add cityscope/src/hooks/useIsochroneResults.ts cityscope/package.json cityscope/package-lock.json
git commit -m "refactor(web): drop the client-side Turf isochrone join"
```

---

### Task 8: Frontend — stop downloading every POI on load

**Files:**
- Modify: `cityscope/src/hooks/usePois.ts`
- Modify: `cityscope/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: nothing

- [ ] **Step 1: Gate the bulk fetch behind the heatmap layer**

Replace the entire contents of `cityscope/src/hooks/usePois.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useLayerStore } from '../store/layerStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface Poi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

async function fetchPois(cityId: string): Promise<Poi[]> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/pois`);
  if (!res.ok) throw new Error(`Failed to fetch POIs: ${res.status}`);
  return res.json() as Promise<Poi[]>;
}

/**
 * The full POI set for a city — 1.2 MB for Berlin, 2.8 MB for Tokyo.
 *
 * Only the heatmap layer and its 300 m spotlight need it now that the isochrone
 * join runs in PostGIS, so it is fetched lazily when that layer is switched on.
 * Cached data survives toggling the layer back off, so re-enabling is instant.
 */
export function usePois() {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const heatmapOn = useLayerStore((s) => s.layers.heatmap);

  return useQuery({
    queryKey: ['pois', cityId],
    queryFn: () => fetchPois(cityId),
    enabled: heatmapOn,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Show that the fetch is happening on the heatmap row**

In `cityscope/src/components/Sidebar.tsx`, add two imports after the existing MUI imports (after line 13's `useMediaQuery` import):

```typescript
import CircularProgress from '@mui/material/CircularProgress';
import { usePois } from '../hooks/usePois';
```

Inside the `Sidebar` component, next to the existing `const toggleLayer = ...` on line 79, add:

```typescript
  // Same shared query the map uses — reading isFetching here costs no extra request.
  const { isFetching: poisFetching } = usePois();
```

Then in the layer row markup, insert a spinner immediately before the `<Switch ...>` element:

```typescript
                    {id === 'heatmap' && poisFetching && (
                      <CircularProgress size={12} sx={{ color: AMBER, mr: 1 }} />
                    )}
                    <Switch
                      edge="end"
                      size="small"
                      checked={on}
                      onChange={() => toggleLayer(id)}
                    />
```

- [ ] **Step 3: Verify build, lint and tests**

```bash
cd cityscope && npx tsc -b && npm run lint && npm test
```

Expected: `tsc -b` and `lint` produce no output; tests PASS — 2 files, 13 tests.

- [ ] **Step 4: Verify the payload is gone on load**

Ask the owner to confirm in his own browser on :5173, with the Network panel open:

> Hard-reload the app. Confirm there is **no** request to `/api/cities/<city>/pois`. Then switch the POI Heatmap layer on — the spinner should appear on that row, the `/pois` request should fire once, and the heatmap should render when it completes. Switch the layer off and on again: no second request should fire, and the heatmap should reappear immediately.

Also worth checking while he is there: switch to **Tokyo**, run an isochrone, and confirm the results panel no longer stalls the UI.

- [ ] **Step 5: Commit**

```bash
git add cityscope/src/hooks/usePois.ts cityscope/src/components/Sidebar.tsx
git commit -m "perf(web): fetch the POI set only when the heatmap is on"
```

---

## Final verification

Run against the whole repo once every task is done.

- [ ] **Backend suite and build**

```bash
cd cityscope-backend && npm test && npm run build
```

Expected: 3 test files, 34 tests, all passing; build silent.

- [ ] **Frontend suite, types, lint and build**

```bash
cd cityscope && npm test && npx tsc -b && npm run lint && npm run build
```

Expected: 2 test files, 13 tests, all passing; the rest silent apart from Vite's bundle summary.

- [ ] **Success criteria from the spec**

- [ ] No `/pois` request on initial page load, for any city.
- [ ] Isochrone band numbers match the Task 6 Step 1 baseline within the boundary tolerance.
- [ ] `useIsochroneResults.ts` deleted; `@turf/boolean-point-in-polygon` and `@turf/helpers` gone from `package.json`.
- [ ] Malformed request bodies return 400, never 500 (Task 3 Step 7).
- [ ] Tokyo's isochrone no longer stalls the main thread.

- [ ] **Update the API endpoint list in `CLAUDE.md`**

The root `CLAUDE.md` lists the key endpoints. Add the new one to that line and commit separately:

```bash
git add CLAUDE.md
git commit -m "docs: note the in-isochrone endpoint in CLAUDE.md"
```
