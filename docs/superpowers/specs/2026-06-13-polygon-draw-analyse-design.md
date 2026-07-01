# Polygon Draw & Analyse — Design

**Date:** 2026-06-13
**Goal:** Let users draw a custom polygon on the map and instantly see what POIs fall inside it — count, area km², density per km², and top categories — computed server-side with a PostGIS `ST_Within` spatial query. A second real spatial query that reuses the `pois.geom` + GiST foundation from the District Statistics feature.

## Scope

One drawing tool + one spatial endpoint + one sidebar module + a validator unit test. Polygon only, one shape at a time. It becomes the **third Analysis tool** alongside Isochrone and Route, following the same `enabled`-flag, map-click-intercept, mutually-exclusive pattern.

**Decisions locked in brainstorming:** drawing via `@mapbox/mapbox-gl-draw`; analysis server-side via PostGIS `ST_Within`; results rendered in the sidebar Analysis module (not a floating card).

## Backend — the spatial query

New endpoint **`POST /api/cities/:cityId/pois/within`** added to the existing `poiRouter` (mounted at `/api/cities/:cityId/pois`, `mergeParams: true`).

- **Request body:** `{ polygon: <GeoJSON Polygon geometry> }` — e.g. `{ "polygon": { "type": "Polygon", "coordinates": [[[lng,lat], ...]] } }`.
- **Validation:** a pure `isPolygonGeometry(value)` guard rejects anything that isn't a closed Polygon (`type === 'Polygon'`, a non-empty outer ring with ≥ 4 positions). Invalid/missing → `400`. This guard is the unit-tested unit.
- **Query (CTE):**
  ```sql
  WITH poly AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g
  ),
  inside AS (
    SELECT p.category
    FROM pois p, poly
    WHERE p.city_id = $2 AND ST_Within(p.geom, poly.g)
  )
  SELECT
    (SELECT count(*) FROM inside)                         AS poi_count,
    (SELECT ST_Area(g::geography) / 1e6 FROM poly)        AS area_km2,
    COALESCE((
      SELECT json_agg(tc) FROM (
        SELECT category, count(*)::int AS count
        FROM inside GROUP BY category ORDER BY count(*) DESC LIMIT 5
      ) tc
    ), '[]'::json)                                        AS top_categories;
  ```
  `$1` = `JSON.stringify(polygon)`, `$2` = `cityId`. The `ST_GeomFromGeoJSON` call is wrapped so a malformed geometry returns `400`, not `500`.
- **Response:** `{ poiCount, areaKm2, densityPerKm2, topCategories: [{category,count}] }`. `densityPerKm2` is computed with the existing `statsMath.densityPerKm2(poiCount, areaKm2)` helper; numbers are rounded (`areaKm2` 3dp, `densityPerKm2` 1dp).

The GiST index on `pois.geom` makes `ST_Within` index-assisted.

## Frontend

- **Dependency:** `@mapbox/mapbox-gl-draw` (+ `@types/mapbox__mapbox-gl-draw`) and its stylesheet `@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css` (imported in `main.tsx`). **Compatibility note:** pin a version known to work with Mapbox GL JS v3 (`@mapbox/mapbox-gl-draw` ≥ 1.4.3); the plan must verify the control mounts cleanly against `mapbox-gl@3.20` and address any peer/CSS quirk before building UI on top of it.
- **`drawStore`** (Zustand) — `enabled: boolean`, `polygon: GeoJSON.Polygon | null`, with `setEnabled`, `setPolygon`, `reset`. `setEnabled(false)` clears the polygon. Mirrors `isochroneStore`/`routeStore`.
- **Mutual exclusivity** (follows the existing convention where each tool's toggle disables the others): `DrawControls` toggle disables Isochrone + Route; `IsochroneControls` and `RouteControls` toggles are updated to also disable Draw.
- **MapView** (`MapView.tsx`):
  - Instantiate a `MapboxDraw` control (polygon + trash modes). Add it to the map when `draw.enabled` becomes true; remove it and clear the polygon when false.
  - On `draw.create` / `draw.update`, read the drawn feature's geometry and call `drawStore.setPolygon(...)`. Enforce one shape: on `draw.create`, delete any previous feature so only the latest remains.
  - Guard the existing map `click` handler to return early when `useDrawStore.getState().enabled` (same pattern as the isochrone/route guards), so drawing doesn't also trigger feature selection.
- **`useAreaAnalysis` hook** (TanStack Query) — keyed on `JSON.stringify(polygon)`, `enabled` only when a polygon exists; `queryFn` POSTs `{ polygon }` to the endpoint. Exposes an `AreaStats` type matching the response.
- **`DrawControls`** component — a sidebar Analysis module: an enable toggle, a "Draw an area on the map" hint while empty, and on result: count / area / density / top-category chips, styled like the District Stats panel. Loading spinner + inline error + "No POIs in this area." empty state.
- **Sidebar** — add `DrawControls` as the third module under "02 — Analysis".

## Edge cases & errors

- 0 POIs inside → "No POIs in this area." (density 0, no chips).
- Query loading → spinner; error → inline message.
- Disabling the tool, or drawing a new shape, clears prior results.
- A degenerate/unclosed polygon never reaches the server: Mapbox GL Draw only emits closed polygons, and the backend guard rejects malformed bodies.

## Testing

- **Backend unit test** (Vitest): `isPolygonGeometry()` — accepts a valid closed Polygon; rejects wrong `type`, missing `coordinates`, and a too-short ring.
- **Endpoint:** manual `curl` with a known Berlin bounding-box polygon → assert `poiCount > 0` and `densityPerKm2 ≈ poiCount / areaKm2`; a non-Polygon body → `400`.
- **Frontend:** manual browser verification — enable Draw, draw a polygon over central Berlin, confirm the module shows count/area/density/categories; redraw replaces the result.

## Out of scope

- City-average comparison (no natural baseline for an arbitrary area).
- Rectangle / circle / freehand modes; multiple simultaneous areas; saving or naming areas.
- Changes to existing isochrone/route/heatmap/district behaviour beyond adding the mutual-exclusivity disable call.

## Affected files

**Backend**
- New: `cityscope-backend/src/lib/geometry.ts` (`isPolygonGeometry`) + `geometry.test.ts`
- Edit: `cityscope-backend/src/routes/pois.ts` (add `POST /within`)

**Frontend**
- Edit: `cityscope/package.json` (+ `@mapbox/mapbox-gl-draw`, `@types/mapbox__mapbox-gl-draw`)
- Edit: `cityscope/src/main.tsx` (import draw CSS)
- New: `cityscope/src/store/drawStore.ts`
- New: `cityscope/src/hooks/useAreaAnalysis.ts`
- New: `cityscope/src/components/DrawControls.tsx`
- Edit: `cityscope/src/components/MapView.tsx` (MapboxDraw integration + click guard)
- Edit: `cityscope/src/components/Sidebar.tsx` (add the module)
- Edit: `cityscope/src/components/IsochroneControls.tsx`, `cityscope/src/components/RouteControls.tsx` (disable Draw on enable)
- Possibly: `cityscope/src/constants/layerConfig.ts` (a `DRAW_COLOR` constant)
