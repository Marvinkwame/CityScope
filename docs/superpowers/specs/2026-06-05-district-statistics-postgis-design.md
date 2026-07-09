# District Statistics Panel — PostGIS Spatial Engine

**Date:** 2026-06-05
**Goal:** Turn PostGIS from a geometry *store* into a spatial *engine*. Clicking a district runs
real spatial SQL on the backend and surfaces an analytical breakdown, closing the project's biggest
credibility gap (the advertised PostGIS differentiator currently does no spatial computation).

## Problem

Today every spatial computation runs client-side in Turf.js (300 m proximity, isochrone↔POI joins).
The backend stores `pois` as plain `lat/lng` floats and serves them with `SELECT ... WHERE city_id`.
PostGIS is used only via `ST_AsGeoJSON` to serialise district polygons — a format conversion, not
analysis. This feature introduces genuine server-side spatial queries.

## Scope

One migration + one endpoint + one panel branch + tests. Deliberately narrow.

Stat depth: **Core + city comparison**.

## 1. Data foundation (migration `002-add-poi-geometry.sql`)

```sql
ALTER TABLE pois ADD COLUMN IF NOT EXISTS geom geometry(Point,4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED;

CREATE INDEX IF NOT EXISTS idx_pois_geom ON pois USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_districts_geom ON districts USING GIST (geom);
```

- A **generated stored column**: auto-maintained from `lat/lng`, so the existing `/pois` endpoint and
  all Turf code keep working untouched. No seed-script changes required.
- GiST indexes on both `pois.geom` and `districts.geom` make the spatial join index-assisted.
- Assumes PostGIS is enabled (districts already depend on it) and district geometry is SRID 4326.

## 2. Spatial query — single endpoint

`GET /api/cities/:cityId/districts/:id/stats`

A new handler in `routes/districts.ts` runs one CTE query (all spatial logic in PostGIS):

- `target` — the clicked district's polygon, with `ST_Area(geom::geography) / 1e6` AS `area_km2`.
- POIs inside via `JOIN pois p ON p.city_id = $cityId AND ST_Contains(target.geom, p.geom)`:
  total count, plus `GROUP BY category ORDER BY count DESC LIMIT 3` for `topCategories`.
- `city_baseline` — the **mean of each district's density** across the city
  (per-district `count / area_km2`, one district = one sample), giving "vs the average district".
- `densityVsCityPct = (districtDensity − cityAvgDensity) / cityAvgDensity * 100`, computed in TS
  from the SQL aggregates via a unit-tested helper.

**Response shape:**
```json
{
  "districtId": 12,
  "name": "Mitte",
  "poiCount": 184,
  "areaKm2": 4.31,
  "densityPerKm2": 42.7,
  "topCategories": [{ "category": "restaurant", "count": 58 }, ...],
  "cityAvgDensity": 30.9,
  "densityVsCityPct": 38.2
}
```

**Pinned definition (avoids ambiguity):** *city average density = the mean of each district's
(POIs ÷ km²)*, equally weighted per district — not total POIs ÷ total area.

## 3. UI surface — reuse the FeaturePanel

A district click already opens the FeaturePanel (desktop right-drawer / mobile bottom-sheet — the
responsive shell already exists). Branch on `selectedFeature.type === 'districts'`:

- New hook `useDistrictStats(cityId, districtId)` (TanStack Query), enabled when a district is selected.
- Render a stats view in place of the raw property table: district name, POI count, area km²,
  density per km², top-category chips, and a comparison row (e.g. `+38% vs city avg`, gold/up or
  muted/down). All other feature types render unchanged.

**Prerequisite (verified gap):** `SelectedFeature` currently carries only `name`/`properties`, not a
feature id, so the district's DB id isn't available to the panel. The district GeoJSON features *do*
carry a top-level `id` (from the `ST_AsGeoJSON` build → Mapbox `feature.id`). Plan must:
- add optional `featureId?: string | number` to `SelectedFeature` (`featureStore.ts`), and
- capture `winner.feature.id` in the `MapView.tsx` click handler.

`useDistrictStats` is enabled only when `type === 'districts'` and `featureId != null`.

## 4. Edge cases & errors

- **0 POIs** → "No POIs in this district", density 0, omit the comparison row.
- **Loading** → slim spinner/skeleton inside the panel (consistent with existing panels).
- **Query error** → inline error message in the panel.
- **city avg density = 0** → guard against divide-by-zero; show "~avg" / no percentage.
- Unknown district id → 404 (consistent with existing `districts/:id`).

## 5. Testing

- **Backend integration test**: hit the endpoint for a known district, assert `poiCount > 0`,
  `densityPerKm2 ≈ poiCount / areaKm2`, and that `densityVsCityPct` is finite and correctly signed.
- **Unit test** for the comparison-formatting helper: `+38%`, `−12%`, and `~avg` (near-zero) cases.

## Out of scope

- Polygon Draw, KNN nearest-amenity, neighbourhood comparison (natural follow-ups on this foundation).
- Caching / materialised stats (compute live — the point is a visible spatial query).
- Frontend changes to existing layer/isochrone/route/heatmap behaviour.

## Affected files

- New: `cityscope-backend/src/scripts/migrations/002-add-poi-geometry.sql`
- Edit: `cityscope-backend/src/routes/districts.ts` (add `/:id/stats`)
- New: `cityscope/src/hooks/useDistrictStats.ts`
- Edit: `cityscope/src/store/featureStore.ts` (add `featureId?`)
- Edit: `cityscope/src/components/MapView.tsx` (capture `winner.feature.id`)
- Edit: `cityscope/src/components/FeaturePanel.tsx` (district-type branch) + a small
  `DistrictStats` presentational piece
- New: backend tests + a frontend helper test
