# CityScope

Full-stack **geospatial analytics** platform: explore urban density and reachability across **8 cities** using real OpenStreetMap data. Portfolio project (owner is job-hunting) — optimise for how it reads to recruiters/interviewers.

> Also read your memory files (`MEMORY.md`) — they hold cross-session context on working style, dev quirks, and what's next.

## Monorepo layout

```
cityscope/           # Frontend — Vite dev server on :5173
cityscope-backend/   # Backend — Express on :3001
docs/superpowers/    # specs + plans (tracked on main — keep committing them; a git clean wiped them once)
```

## Tech stack

- **Frontend:** React 19 · TypeScript · Vite 8 · Mapbox GL JS 3 · @mapbox/mapbox-gl-draw · Turf.js · MUI 7 · Zustand 5 · TanStack Query 5 · Vitest
- **Backend:** Node · TypeScript (NodeNext ESM, run via `tsx`) · Express 5 · **PostgreSQL + PostGIS** (`pg`) on Neon · Vitest
- **External APIs:** Overpass (OSM data) · Mapbox Isochrone / Directions / Geocoding

## Commands

```bash
# frontend (cd cityscope)
npm run dev            # :5173
npm run build          # tsc -b && vite build
npm run lint
npm test               # Vitest

# backend (cd cityscope-backend)
npm run dev            # :3001 (tsx watch)
npm run build          # tsc
npm test               # Vitest
npm run migrate -- <file>.sql       # apply a migration from src/scripts/migrations/
npm run fetch:pois -- <city>        # fetch POIs from Overpass -> pois-data-<city>.json
npm run seed:all                    # load cities + districts + POIs into the DB
```

## Architecture

- **Map isolation:** ALL Mapbox source/layer/control/marker mutations live in `cityscope/src/components/MapView.tsx` and react to store changes via `useEffect`. UI writes to Zustand stores; the map reads from them.
- **Imperative store reads in map event handlers** (`useStore.getState()`) to dodge stale closures inside GL JS's event system.
- **PostGIS is a spatial engine, not just a store.** `pois` has a generated `geom geometry(Point,4326)` column + **GiST index** (migration `002`). District stats and drawn-area analysis run server-side via `ST_Contains` / `ST_Within` / `ST_Area(::geography)`. Lightweight proximity (300 m spotlight) uses Turf.js client-side.
- **Stores** (`cityscope/src/store/`): `cityStore`, `layerStore`, `mapStore`, `isochroneStore`, `routeStore`, `drawStore`, `featureStore`, `heatmapStore`, `geoSearchStore`, `uiStore`. Analysis tools (isochrone/route/draw) are **mutually exclusive** — each control disables the others via `getState()`.
- **TanStack Query** for all async data (isochrone, route, geocode, districts, pois, district stats, area analysis) with `queryKey` caching + `enabled` guards.
- **Save & Share:** app state → base64url blob in the URL hash (`cityscope/src/lib/shareCodec.ts` + `shareState.ts` + `useShareSync.ts`), rehydrated on load behind a hydration guard.

### Key API endpoints (city-scoped, `:cityId` e.g. `berlin`)
`GET /api/cities` · `GET /api/cities/:cityId/districts` · `GET /api/cities/:cityId/districts/:id/stats` · `GET /api/cities/:cityId/pois` · `POST /api/cities/:cityId/pois/within`

## Conventions

- Strict TypeScript, **no `any`**; type-only imports use `import type`; NodeNext ESM on the backend means relative imports carry a `.js` extension.
- MUI `sx` styling; dark "cartographer's instrument" theme — graphite surfaces + a single gold accent (`AMBER`), cyan reserved for live data (`cityscope/src/theme.ts`).
- **Commits: granular, one concern each, NO `Co-Authored-By` trailer.** One concern per branch. The user usually commits themselves.
- New features: brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven execution.

## Environment

- `cityscope/.env.local`: `VITE_MAPBOX_TOKEN`, `VITE_API_URL=http://localhost:3001`
- `cityscope-backend/.env`: `DATABASE_URL` (Neon Postgres+PostGIS), `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`

## Working notes

- The user runs their own frontend server on **:5173**, and backend CORS is pinned there — so **verify the backend with `curl` on :3001** and hand live browser checks to the user (a preview server on another port breaks CORS / `useCities`).
- **Overpass rate-limits (429/504)** — fetch cities sequentially with cooldowns and retry.
- All feature work through 2026-08-29 is **merged to `main`** (PR #4): district statistics, polygon draw & analyse, save & share, uncapped POI data, and the README rewrite. The old feature branches are ancestors of `main` and safe to delete. Still confirm what's on `main` vs a branch before assuming, and put new work on its own branch.
- **Deployed:** frontend on Vercel (`city-scope-seven.vercel.app`) → API on **Render** (`cityscope-rzj5.onrender.com`) → Neon PostGIS. Note `cityscope-backend/.env.example` still says Railway; it's wrong. Render's free tier cold-starts at ~8–9 s after idle (warm calls are 300–700 ms), so first-load latency is a known issue, not a bug you've just introduced.
