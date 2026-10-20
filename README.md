# CityScope

**A full-stack geospatial analytics platform for exploring urban density and reachability** — draw custom areas, run walk-time isochrones, click districts for on-the-fly statistics, and share any view via a link. Powered by real OpenStreetMap data, **PostGIS** spatial queries, and Mapbox GL JS.

🔗 **[Live Demo](https://city-scope-seven.vercel.app)** &nbsp;·&nbsp; [Frontend](cityscope/) &nbsp;·&nbsp; [Backend](cityscope-backend/)

---

## What it does

Real OpenStreetMap POI data (about 242,000 places across **8 cities** in the repository's data files, 232,620 of them in the 17 categories the app displays; the deployed site is reloaded with this data after the Everyday reach branch merges), analysed four different ways:

| Feature | Description |
|---------|-------------|
| **District Statistics** | Click a district → the backend runs a live **PostGIS** query (`ST_Contains` / `ST_Area`) returning POI count, area, density per km², top categories, and how the district compares to the city-wide average. |
| **Draw Area & Analyse** | Sketch any polygon on the map → it's POSTed to the backend, which counts the POIs inside with **`ST_Within`** and returns a category breakdown, area, and density. |
| **Isochrone Analysis** | Click any point to draw walking / cycling / driving reachability polygons across multiple time bands (5–30 min). POIs are spatially joined to each band and aggregated in the sidebar with fly-to. |
| **Route Planning** | Place two pins (A → B) for a real route with distance, duration, and a turn-by-turn step list. Walking / cycling / driving profiles. |
| **POI Heatmap + Spotlight** | Kernel-density heatmap; click anywhere for the nearest places within 300 m by category (computed client-side with Turf.js), sorted by distance. |
| **Geocoding Search** | Debounced search for addresses / landmarks worldwide, biased to the active city. Fly-to + pin. |
| **Save & Share** | The full view — city, camera, layers, 3D, and the active analysis tool with its inputs — serialises to a base64url **URL hash**, so any configured view is a shareable, restorable link. |
| **Layers, 3D & Multi-city** | Toggle roads / buildings / districts / heatmap; extrude buildings in 3D; switch between 8 cities. |

Responsive down to a mobile bottom-sheet layout.

---

## Tech stack

**Frontend** — React 19 · TypeScript · Vite 8 · Mapbox GL JS 3 · `@mapbox/mapbox-gl-draw` · Turf.js · Material UI 7 · Zustand 5 · TanStack Query 5 · Vitest

**Backend** — Node.js · TypeScript · Express 5 · **PostgreSQL + PostGIS** (`pg`) · Vitest

**Data** — OpenStreetMap via the **Overpass API**; Mapbox Isochrone / Directions / Geocoding APIs

---

## Architecture highlights

**PostGIS as a spatial engine, not just a store.** POIs carry a generated `geometry(Point,4326)` column (auto-derived from `lat/lng`) with a **GiST spatial index**. District and drawn-area analysis run as indexed server-side queries — `ST_Contains`, `ST_Within`, `ST_Area(::geography)` — rather than shipping every point to the browser. Schema changes ship as idempotent SQL migrations applied through a small runner.

**Spatial work runs where it belongs.** Heavy point-in-polygon joins execute in PostGIS on the server; lightweight proximity math (the 300 m spotlight) uses Turf.js on the client. A deliberate split for responsiveness.

**All Mapbox mutations in one place.** Every source, layer, control, and marker lives in `MapView.tsx` and reacts to store changes via `useEffect`. UI components write to Zustand; the map reads from it — isolating the map lifecycle.

**Imperative store reads in event handlers.** Map click handlers use `useStore.getState()` instead of hook subscriptions to avoid stale closures inside Mapbox's event system — a common GL JS + React gotcha.

**TanStack Query for all async data.** Isochrones, routes, geocoding, districts, POIs, district stats, and area analysis are all queries with `queryKey` caching, `enabled` guards, and `staleTime`.

**Design tokens, enforced by a test.** Every colour plays one of three roles (*you*, *answer*, *context*) defined once in `theme.ts` as plain constants that both MUI styles and Mapbox paint properties can read. A Vitest guard fails `npm test` on any colour literal outside `theme.ts`, so the palette cannot drift back.

**Deep-linkable state.** A pure, unit-tested codec serialises app state to the URL hash and rehydrates it on load, guarding the city-change auto-fly so a restored view isn't clobbered.

---

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL **with the PostGIS extension** (local, or a managed provider like Neon)
- A Mapbox access token ([free](https://account.mapbox.com/access-tokens/))

### 1. Backend
```bash
cd cityscope-backend
npm install
cp .env.example .env          # set DATABASE_URL, PORT=3001, CORS_ORIGIN (and CITYSCOPE_DB_TARGET=local if DATABASE_URL is a local database)

# schema + data
npm run seed:cities                     # seed the 8 city records
npm run migrate -- 002-add-poi-geometry.sql   # add geom column + GiST indexes
npm run fetch:pois -- berlin            # fetch POIs from Overpass (repeat per city)
npm run seed:all                        # load districts + POIs into the DB

npm run dev                   # http://localhost:3001
```
> The repo ships pre-fetched `pois-data-*.json` for all cities, so you can skip `fetch:pois` and go straight to `seed:all`.

**`CITYSCOPE_DB_TARGET`.** The scripts that write to a database (`migrate`, `seed:cities`, `seed:pois`, `seed:parks`, `seed:all`, `reach:build`, `reach:calibrate`, `reach:publish`, `reach:check-gp`) refuse to run unless this holds a non-empty label of your choosing (`local`, `reach-dev`, `production`), and they print it with the database host before connecting, as `Writing to local (localhost:5432)`. The label is only what you typed: nothing checks it against `DATABASE_URL`, so the printed host is the part to read. For a local database, `CITYSCOPE_DB_TARGET=local` can stay in `.env`, as long as that file's `DATABASE_URL` really is a local database. For any other target, set it on the command line for that run (`CITYSCOPE_DB_TARGET=production npm run ...`) and keep it out of `.env`. `reach:build --dry-run` writes nothing and doesn't need it.

#### Everyday reach data (optional)

**Everyday reach** asks how close the people of a city live to six everyday needs: a supermarket, a pharmacy, a doctor, a school, a park and a station. It answers block by block, with an estimated walking time from the middle of each populated block to the nearest place for each need.

The two `/reach` endpoints serve data built ahead of time, one city at a time. For each populated block (an H3 hexagon at resolution 9) it holds the estimated residents and the straight-line distance to the nearest supermarket, pharmacy, doctor, school, park and station. To build a city, with `CITYSCOPE_DB_TARGET` set:

```bash
npm run migrate -- 004-everyday-reach.sql   # once: reach tables + a geography index on pois
npm run fetch:pois  -- berlin       # places, 19 categories, over the city's fetch box
npm run fetch:parks -- berlin       # parks as shapes -> data/parks-berlin.json
npm run seed:pois   -- berlin       # replace the city's places
npm run seed:parks  -- berlin       # replace the city's parks
npm run reach:build -- berlin       # cells, residents, nearest place per need
npm run reach:calibrate -- berlin   # fit the walking estimate against Mapbox
npm run reach:check-gp              # London only, optional: compare its doctors with NHS GP practices
npm run reach:publish -- berlin     # compress the result into the one payload the API serves
```

- `fetch:pois` and `fetch:parks` also record when they ran and the OSM database time Overpass answered from, beside the file they wrote: `src/scripts/pois-data-<city>.source.json` (committed) and `data/parks-<city>.source.json` (git-ignored). `reach:publish` copies these, and the calibration time, into the payload's `meta.sources`. The files fetched on 2026-10-20 carry only that date, with the OSM time unknown (`null`).
- `reach:build` reads GHSL population tiles from `cityscope-backend/data/ghsl/` (or `--ghsl <dir>`). Download the 2025 epoch, 3-arcsecond, WGS84 tiles of GHS-POP R2023A (`GHS_POP_E2025_GLOBE_R2023A_4326_3ss`) that cover the city and unzip the `.tif` files there. `data/` is git-ignored.
- `npm run reach:build -- berlin --dry-run` counts the city's residents in a read-only transaction and writes nothing.
- `reach:calibrate` asks Mapbox for the walking isochrones of 60 sampled blocks per city and needs `MAPBOX_TOKEN` in `.env`: a token used only by scripts, never the frontend's public one. Each answer is cached in `cityscope-backend/data/isochrones/<city>/<h3>.json` (git-ignored) and reused for the same request, so a rerun on the same blocks makes no requests and needs no token. It prints, and stores in `reach_calibration.checks` as `calibrationBaseline`, each band's base rate beside its agreement.
- `reach:check-gp` is for London only and takes no city. It reads NHS England's GP practice list (the ODS `epraccur` file, saved as `cityscope-backend/data/nhs/epraccur.csv`, git-ignored), looks each practice's postcode up on postcodes.io, and stores the share of London's practices that have an OSM doctor or clinic within 150 m. It needs London built and calibrated, and `reach:publish -- london` afterwards puts the result into the payload.
- **Rebuild after every place reload.** `reach_nearest` stores place ids, and reloading places (`seed:pois`, `seed:parks`, or `seed:all`, which reloads every city's places and districts) gives every place a new id. So the reload deletes that city's reach cells, nearest places, calibration and payload in the same transaction, and says so: a stale block card or payload can never be served, and the city's `/reach` endpoints answer 404 until it is rebuilt. After a reload, run `reach:build`, `reach:calibrate` and `reach:publish` again for each city reloaded, and for London `reach:check-gp` between calibrate and publish (a rebuild clears its result). `reach:build` clears the city's calibration and payload, and `reach:calibrate` clears its payload, so `GET /reach` answers 404 until `reach:publish` has run again, and the block card (`/reach/:cellId`) answers 404 until `reach:calibrate` has run.

### 2. Frontend
```bash
cd cityscope
npm install
cp .env.example .env.local    # set VITE_MAPBOX_TOKEN and VITE_API_URL=http://localhost:3001
npm run dev                   # http://localhost:5173
```

### Tests
```bash
npm test    # Vitest — in both cityscope/ and cityscope-backend/
```

---

## API

City-scoped routes (`:cityId` e.g. `berlin`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/cities` | All available cities |
| GET  | `/api/cities/:cityId/districts` | District boundaries (GeoJSON) |
| GET  | `/api/cities/:cityId/districts/:id/stats` | Live district statistics (PostGIS) |
| GET  | `/api/cities/:cityId/pois` | POI records for a city |
| POST | `/api/cities/:cityId/pois/within` | Count POIs inside a drawn polygon (`ST_Within`) |
| GET  | `/api/cities/:cityId/reach` | Everyday reach for a whole city: one precomputed GeoJSON of populated H3 blocks with their estimated residents and distance to the nearest of six everyday needs. Brotli-compressed when the client accepts it, with an `ETag` (`304` when unchanged); `404` until the city has been published |
| GET  | `/api/cities/:cityId/reach/:cellId` | One block's residents and, for each need, its nearest place (name, category, coordinates, metres, estimated minutes rounded up, so they agree with the map's colour). `400` for a malformed cell id, `404` for an unknown cell |

The two reach endpoints are the data layer for Everyday reach; the map layer that reads them is not built yet. The data has been built and checked for all eight cities on a local database, but it has not been loaded into the deployed API yet.

---

## Data & honesty note

POIs are real OpenStreetMap data fetched via Overpass for a fixed set of **19 categories**: the original 11 (food & drink, culture, leisure, retail) plus the everyday needs (pharmacies, doctors and clinics, schools, rail stations and halts, tram stops and metro entrances). Two of the 19, tram stops and metro entrances, only measure the station need in Everyday reach; place lists, district statistics and drawn-area results leave them out, and the heatmap still draws only the original 11. Counts are complete **for those categories within each city's fetch box**: the extent of its district outline plus 2 km on every side (never smaller than the city's earlier bounds), so places just across the boundary count for the blocks beside it. It is not every POI type, and the box is a rectangle rather than an exact administrative boundary.

Both point features and area features are included; an area such as a park or a museum building is represented by its centre point, so a distance to a large park is measured to its middle, not its nearest edge. Everyday reach treats parks differently: they are also stored as shapes (a `parks` table, with multipolygon relations assembled by `osmtogeojson`), and the park need counts only parks of at least 0.5 ha (5,000 m²), measured to the nearest edge. Categories match exact OSM tag values (so `amenity=pub` counts, `amenity=public_bookcase` does not). Some places are mapped twice in OSM itself: 665 of the 232,620 displayed places (0.29%) share their category and name with another place less than 25 m away (measured on the 2026-10-20 data; unnamed places are not counted). They are kept rather than merged by a distance heuristic, which would also merge genuine neighbouring chain outlets.

**Residents and walking times in Everyday reach are estimates.** Residents come from the GHSL population grid (2025 epoch, 3-arcsecond tiles), a modelled grid rather than a census, added up into H3 resolution-9 hexagons. A walk is estimated as straight-line distance divided by a per-city metres-per-minute figure, fitted against Mapbox walking isochrones (5, 10, 15 and 20 minutes) on a sample of 60 blocks per city. A time limit passes for a city only if the estimate agrees with Mapbox on at least 80% of a held-out half of that sample, and the payload records which ones passed. Measured on 2026-10-20, **every one of the eight cities passed at all four time limits**. Agreement on the held-out half ran from 85.0% (Tokyo, 5 minutes) to 100.0% (Paris and Sydney, 20 minutes), and at 15 minutes from 94.4% (Berlin) to 99.4% (Paris and Sydney). The 5-minute limit has the lowest agreement in every city. The published speeds are between 62.5 (Berlin) and 69.5 (Amsterdam and Sydney) straight-line metres per minute. Agreement is graded at the speed fitted on the other half of the sample, while the published speed is refitted on all 60 blocks, so the figures describe a slightly different fit from the one the map uses.

**Read the agreement against the base rate:** how often the nearest place is within the limit at all, which is what always answering "within" would score. At 5 minutes that is 44–61% (Paris 76%), so the estimate's 85–93% is real information. At 15 and 20 minutes it is 87–100%, and in the dense cities the estimate barely beats it: at 20 minutes it equals it in London and Paris and falls 1.1 points short in Berlin, and always answering "within" would itself clear the 80% bar at 15 minutes in every city. The 5-minute limit is therefore the informative one. Each payload carries its base rates beside its agreement. The per-city figures, residents, payload sizes and places per 100,000 residents are in the spec's [measured results](docs/superpowers/specs/2026-10-17-everyday-reach-design.md#measured-results).

**London's doctors were checked against the NHS list of GP practices.** Of the 1,142 practices inside London's outline, 70.7% have an OpenStreetMap doctor or clinic within 150 m (median distance 57 m), so about three in ten do not. The test is strict, because a postcode places a practice only roughly, but it does mean OSM's London doctors may be incomplete or tagged differently, and London's distances to a doctor may be overstated.

Place and park data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). The committed place files (`cityscope-backend/src/scripts/pois-data*.json`) are ODbL, not MIT.

Population data: Schiavina, Freire, Carioli, MacManus (2023), *GHS-POP R2023A*, European Commission, Joint Research Centre (JRC), doi:[10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE](https://doi.org/10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

## License

The code is MIT. The OpenStreetMap-derived data files, the committed `cityscope-backend/src/scripts/pois-data*.json` and the park files `fetch:parks` writes, are © OpenStreetMap contributors under the [ODbL](https://opendatacommons.org/licenses/odbl/), not MIT. GHSL population data is CC BY 4.0, as cited above.
