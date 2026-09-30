# Server-Side Isochrone POI Join — Design

**Date:** 2026-08-29
**Status:** Approved, ready for planning
**Branch:** `feat/server-side-isochrone-join`

## Problem

The isochrone feature is the one place where CityScope's architecture contradicts its own headline claim. The README leads with "PostGIS is a spatial engine, not just a store," and district statistics and drawn-area analysis honour that. The isochrone POI join does not: `useIsochroneResults.ts` pulls *every* POI for the active city into the browser and runs `booleanPointInPolygon` over it client-side.

Two costs follow:

1. **Payload.** `usePois` has no `enabled` guard, so every page load downloads the full POI set for the city — measured 1.2 MB for Berlin, 2.8 MB for Tokyo (~33k POIs).
2. **Main-thread work.** Tokyo runs roughly 100k point-in-polygon tests synchronously inside a `useMemo` (33k POIs × 3 contour bands) on every isochrone change.

It is also the weakest point in the interview story: a reviewer who reads the code finds a spatial engine that gets bypassed for the most spatial-looking feature in the app.

## Goals

- Move the POI-in-band join into PostGIS, using the existing GiST index on `pois.geom`.
- Stop the default page load from downloading the full POI set.
- Preserve the existing UI behaviour and numbers, within a documented boundary tolerance.

## Non-goals

- Changing how the isochrone polygons are fetched or rendered.
- Moving the Mapbox Isochrone call server-side (see Rejected Alternatives).
- Touching the 300 m heatmap spotlight, which stays client-side on Turf by design — it is lightweight proximity, not analysis.

## Measurements taken during design

Against the live deployment (Vercel frontend, Render API, Neon PostGIS) on 2026-08-29:

| Call | Cold | Warm |
|------|------|------|
| `/api/cities` | 7.7 s | 291 ms |
| `/api/cities/berlin/pois` (1.2 MB) | 8.6 s | 691 ms |
| `/api/cities/tokyo/pois` (2.8 MB) | 8.7 s | 1300 ms |
| `/districts/:id/stats` (3-CTE query) | — | 684 ms |
| `/pois/within` (2269 POIs returned) | — | 402 ms |

Mapbox Isochrone response sizes (Berlin origin, `polygons=true`):

| Profile / contours | Payload | Geometry types |
|---|---|---|
| walking 5,10,15 | 3 KB | all `Polygon` |
| driving 10,20,30 | 27 KB | all `Polygon` |

The 27 KB worst case sits comfortably inside the 100 KB `express.json()` default, so raising the body limit is documentation of intent, not a required fix.

## Approach

The client keeps fetching the isochrone from Mapbox and keeps rendering it unchanged. A new hook posts the resulting contour geometries to a new endpoint, which performs the join in PostGIS and returns per-band results.

### Backend

**Endpoint:** `POST /api/cities/:cityId/pois/in-isochrone` on the existing `poiRouter`.

**Request body** — a contract of our own, deliberately *not* Mapbox's FeatureCollection shape:

```json
{ "contours": [ { "contour": 5, "geometry": { "type": "Polygon", "coordinates": [] } } ] }
```

The client maps Mapbox's response into this shape before posting. If Mapbox changes their payload format, one pure client-side function changes rather than the API contract.

**Validation** — a new pure guard in `lib/geometry.ts`, alongside `isPolygonGeometry`:

- `contours` must be a non-empty array of at most 6 entries.
- Each entry needs an integer `contour` and a structurally valid `Polygon` or `MultiPolygon`.
- Anything else returns **400 before any SQL runs**, matching the `/pois/within` precedent.

`MultiPolygon` is accepted even though Mapbox does not currently emit it with `polygons=true`. `ST_Within` is indifferent to the distinction, and the existing `useIsochroneResults` already defended against both — there is no reason for the server to be stricter than the client was.

**The query** — one round trip, unnesting the posted geometries and spatial-joining each against the GiST-indexed `pois.geom`:

```sql
WITH bands AS (
  SELECT (c->>'contour')::int AS contour,
         ST_SetSRID(ST_GeomFromGeoJSON(c->'geometry'), 4326) AS g
  FROM jsonb_array_elements($1::jsonb) AS c
)
SELECT b.contour, p.id, p.name, p.category, p.lat, p.lng
FROM bands b
JOIN pois p ON p.city_id = $2 AND ST_Within(p.geom, b.g)
ORDER BY b.contour, p.category, p.name
```

The 400 contract is enforced entirely by the structural guard above.

> **Corrected during implementation (2026-08-29).** This section originally said `ST_GeomFromGeoJSON` would be wrapped so malformed geometry surfaces as a 400 rather than a 500. Testing against Neon showed that is unnecessary: an unclosed ring, a non-numeric third ordinate, a zero-area ring and out-of-range coordinates all parse without error and return 200. Anything the structural guard admits, PostGIS accepts. A message-sniffing catch block was therefore removed — it was unreachable, and matching on "geometry" risked reporting a genuine server fault as a client error.

**Cumulative band semantics are preserved deliberately.** Each contour polygon is tested independently, so a POI inside the 5-minute band also appears in the 10- and 15-minute bands. This is exactly what the current client-side code does. It is recorded here because it is the kind of semantic that gets silently inverted in a rewrite, quietly changing every number in the UI.

**Response shaping** — SQL returns flat rows; a pure `groupPoisByBand(rows)` helper in `lib/` turns them into:

```ts
{ bands: [ { contour: number, poiCount: number, categoryCounts: Record<string, number>, pois: Poi[] } ] }
```

This follows the split `statsMath.ts` already established: spatial aggregates in SQL, derived shaping in tested TypeScript that needs no database.

### Frontend

**New hook `useIsochronePois(isochroneData)`:**

```ts
queryKey: ['isochrone-pois', cityId, origin?.lng, origin?.lat, profile, contourMinutes.join(',')]
enabled: enabled && origin !== null && !!isochroneData
```

Keying on the *inputs* that determine the isochrone, rather than hashing the geometry, keeps the key cheap and legible in devtools. This is safe because `useIsochrone` keys on the same inputs and does not use `placeholderData`, so its `data` goes `undefined` when the key changes — and the `!!isochroneData` guard therefore prevents posting the previous origin's polygons under a new key.

**Pure `toContourPayload(featureCollection)`** does the Mapbox-to-contract mapping: filter to Polygon/MultiPolygon features, read `properties.contour`, sort ascending. Pure, so directly unit-testable, and it inherits the ascending sort the old hook performed.

**`IsochroneResultsPanel` changes are small**, because the server contract was matched to what the panel already renders. `usePois()` + `useIsochroneResults(...)` collapse into one `useIsochronePois(...)`; bands keep the shape `{ contour, poiCount, categoryCounts, pois[] }`, so the accordion, the top-4 category chips, the "+N more" chip, and the clickable fly-to rows keep working — those rows need `id`, `name`, `category`, `lat`, `lng`, which the `SELECT` returns.

Two states must be added:

- **A second loading stage.** Today `hasResults` gates on the Mapbox stage's `loading` and returns `null` otherwise, so while the join is in flight the entire panel would disappear — reading as a broken feature. It needs a spinner for the join.
- **An error branch.** The panel has none today; isochrone errors surface in `IsochroneControls` via the store. A failed join has nowhere to appear, so it needs one inline line, matching the `DrawControls` precedent (the "Couldn't analyse this area." pattern).

**Deletions:** `useIsochroneResults.ts`, plus the `@turf/boolean-point-in-polygon` and `@turf/helpers` dependencies — verified imported nowhere else. `@turf/distance` stays for the 300 m spotlight.

### Stopping the bulk download

`usePois` gains one guard: `enabled: useLayerStore((s) => s.layers.heatmap)`. All three consumers share that hook, so this is a single point of change.

Traced consequences:

- MapView's heatmap effect already guards on `!poisData`, so it simply will not add the source until the layer is switched on.
- Toggling the heatmap **off** disables the query but leaves cached data in place (`staleTime` 5 min), so the source stays, hidden by `visibility: none`, and toggling back on is instant.
- `useHeatmapSpotlight` already returns `null` without POIs.
- A share link with `heatmap: true` sets the layer during hydration, which enables the query.

**The one real UX cost:** switching the heatmap on now waits 0.7 s (Berlin) to 1.3 s (Tokyo) for data that used to be prefetched. Without an indicator, that delay reads as a dead toggle — so the POI Heatmap row in the Sidebar's LAYERS section needs a small spinner while `isFetching`.

## Testing

**Automated — pure units only**, matching the `geometry.test.ts` / `statsMath.test.ts` precedent, no DB fixture required.

- Backend, the contours guard: valid input; empty array; over the 6-entry cap; missing `contour`; non-integer `contour`; wrong geometry type; malformed coordinates.
- Backend, `groupPoisByBand`: multiple bands; cumulative duplication across bands; category counting; a band with no POIs; ordering preserved.
- Frontend, `toContourPayload`: filters non-polygon features; reads `contour`; sorts ascending; handles empty and undefined input.

**Known coverage gap, stated rather than papered over:** the SQL itself remains untested by automated tests, because this project has no database fixture. It is verified by `curl` against :3001, consistent with the existing workflow.

**Manual regression check, to be done BEFORE deleting the Turf path.** Fix an origin (Berlin 13.405,52.52, walking, 5/10/15), record the current client-side band counts, then compare against the server's.

Expect a discrepancy of a POI or two, and treat it as correct: Turf's `booleanPointInPolygon` counts points exactly on the boundary as inside (`ignoreBoundary` defaults to false), whereas `ST_Within` excludes boundary points. `ST_Covers` would give exact parity, but `ST_Within` is kept for consistency with the existing `/pois/within` endpoint. Recorded so nobody chases a phantom off-by-two.

## Success criteria

- No `/pois` request on initial page load, for any city.
- Isochrone band numbers match the previous client-side values within the boundary tolerance above.
- `useIsochroneResults.ts` deleted; `@turf/boolean-point-in-polygon` and `@turf/helpers` removed from `package.json`.
- Malformed request bodies return 400, never 500.
- Tokyo's isochrone no longer stalls the main thread.

## Rejected alternatives

**Backend calls the Mapbox Isochrone API itself**, returning polygons and bands in one response. Rejected. Its headline benefit is usually framed as getting the Mapbox token off the client, but that does not apply here: the frontend needs a public token anyway for the basemap (`mapboxgl.accessToken`), so moving this one call server-side removes nothing. Meanwhile the costs are real — a new `MAPBOX_TOKEN` on Render, a live external dependency inside the API with its own rate limits and error mapping, and rewiring MapView's isochrone render source from `useIsochrone` to the new hook. The chosen approach captures the entire PostGIS win at a fraction of the blast radius. Worth revisiting only if the second round trip proves to matter.

**Overloading the existing `POST /pois/within`** to accept either a single polygon or a set of contours, returning two different response shapes. Rejected: one endpoint, one contract. The two differ in more than arity — `/within` returns aggregates only, while this needs per-band POI rows.

**Doing only the server-side join, leaving `usePois` ungated.** Rejected during design: the heatmap would still request every POI on load, so the 2.8 MB Tokyo download would survive and the perf seam would only be half closed.

## Notes for the implementer

- Backend is NodeNext ESM: relative imports carry a `.js` extension.
- Strict TypeScript, no `any`; type-only imports use `import type`.
- Commits granular, one concern each, no `Co-Authored-By` trailer.
- Verify the backend with `curl` on :3001. The owner runs his own frontend on :5173 and backend CORS is pinned there, so hand live browser checks to him rather than starting a competing preview server.
