# CityScope

**A full-stack geospatial analytics platform for exploring urban density and reachability** — draw custom areas, run walk-time isochrones, click districts for on-the-fly statistics, and share any view via a link. Powered by real OpenStreetMap data, **PostGIS** spatial queries, and Mapbox GL JS.

🔗 **[Live Demo](https://city-scope-seven.vercel.app)** &nbsp;·&nbsp; [Frontend](cityscope/) &nbsp;·&nbsp; [Backend](cityscope-backend/)

---

## What it does

Real OpenStreetMap POI data (~180,000 places across **8 cities**), analysed four different ways:

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
cp .env.example .env          # set DATABASE_URL, PORT=3001, CORS_ORIGIN

# schema + data
npm run seed:cities                     # seed the 8 city records
npm run migrate -- 002-add-poi-geometry.sql   # add geom column + GiST indexes
npm run fetch:pois -- berlin            # fetch POIs from Overpass (repeat per city)
npm run seed:all                        # load districts + POIs into the DB

npm run dev                   # http://localhost:3001
```
> The repo ships pre-fetched `pois-data-*.json` for all cities, so you can skip `fetch:pois` and go straight to `seed:all`.

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

---

## Data & honesty note

POIs are real OpenStreetMap data fetched via Overpass for a fixed set of 11 categories (food & drink, culture, leisure, retail) within each city's bounding box. Counts are complete **for those categories within that bbox** — not every POI type, and the bbox is a rectangle rather than an exact administrative boundary.

Both point features and area features are included; an area such as a park or a museum building is represented by its centre point, so a distance to a large park is measured to its middle, not its nearest edge. Categories match exact OSM tag values (so `amenity=pub` counts, `amenity=public_bookcase` does not). Roughly 0.3% of rows are places mapped twice in OSM itself; they are kept rather than merged by a distance heuristic, which would also merge genuine neighbouring chain outlets.

---

## License

MIT
