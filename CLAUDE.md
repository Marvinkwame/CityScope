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
npm run typecheck:scripts           # type-check src/scripts (tsconfig.scripts.json)
npm run migrate -- <file>.sql       # apply a migration from src/scripts/migrations/
npm run fetch:pois -- <city>        # fetch POIs from Overpass -> pois-data-<city>.json
npm run seed:all                    # load cities + districts + POIs into the DB

# Everyday reach pipeline, per city, in this order (see "Everyday reach" below)
npm run fetch:parks -- <city>       # parks as shapes from Overpass -> data/parks-<city>.json (git-ignored)
npm run seed:pois -- <city>         # replace one city's POIs
npm run seed:parks -- <city>        # replace one city's parks
npm run reach:build -- <city> [--ghsl <dir>] [--dry-run]   # H3 cells + GHSL residents + nearest place per need
npm run reach:calibrate -- <city>   # fit metres-per-minute against Mapbox walking isochrones (needs MAPBOX_TOKEN)
npm run reach:publish -- <city>     # compress the city's payload into reach_payloads
```

## Architecture

- **Map isolation:** ALL Mapbox source/layer/control/marker mutations live in `cityscope/src/components/MapView.tsx` and react to store changes via `useEffect`. UI writes to Zustand stores; the map reads from them.
- **Imperative store reads in map event handlers** (`useStore.getState()`) to dodge stale closures inside GL JS's event system.
- **PostGIS is a spatial engine, not just a store.** `pois` has a generated `geom geometry(Point,4326)` column + **GiST index** (migration `002`). District stats and drawn-area analysis run server-side via `ST_Contains` / `ST_Within` / `ST_Area(::geography)`. Lightweight proximity (300 m spotlight) uses Turf.js client-side.
- **Stores** (`cityscope/src/store/`): `cityStore`, `layerStore`, `mapStore`, `isochroneStore`, `routeStore`, `drawStore`, `featureStore`, `heatmapStore`, `geoSearchStore`, `uiStore`. Analysis tools (isochrone/route/draw) are **mutually exclusive** — each control disables the others via `getState()`.
- **TanStack Query** for all async data (isochrone, route, geocode, districts, pois, district stats, area analysis) with `queryKey` caching + `enabled` guards.
- **Save & Share:** app state → base64url blob in the URL hash (`cityscope/src/lib/shareCodec.ts` + `shareState.ts` + `useShareSync.ts`), rehydrated on load behind a hydration guard.

### Key API endpoints (city-scoped, `:cityId` e.g. `berlin`)
`GET /api/cities` · `GET /api/cities/:cityId/districts` · `GET /api/cities/:cityId/districts/:id/stats` · `GET /api/cities/:cityId/pois` · `POST /api/cities/:cityId/pois/within` · `POST /api/cities/:cityId/pois/in-isochrone` · `GET /api/cities/:cityId/reach` · `GET /api/cities/:cityId/reach/:cellId`

`GET /pois` returns the whole city's POI set (1.2 MB Berlin, 2.8 MB Tokyo) and is fetched **only when the heatmap layer is on** — it feeds the heatmap and the 300 m spotlight, nothing else. The isochrone POI-in-band join runs server-side via `/pois/in-isochrone` (`ST_Within` per contour), so it never needs the bulk set. POI routes leave out the measurement-only categories (`tram_stop`, `subway_entrance`); the heatmap draws only the original 11 categories, the spotlight lists all 17 displayed ones.

## Everyday reach (data and API built; the map layer is Phase 2)

Spec: `docs/superpowers/specs/2026-10-17-everyday-reach-design.md` (with an "Amendments while building Phase 1" section — read it before changing the pipeline).

- **Migrations:** `003` repairs invalid district outlines (applied to production 2026-10-16; the file is on `fix/district-outlines` and reaches other branches once that is merged to `main`). `004-everyday-reach.sql` adds a `GIST ((geom::geography))` index on `pois` and the tables `parks`, `reach_cells`, `reach_nearest`, `reach_calibration` and `reach_payloads`.
- **Pipeline** (per city): `fetch:pois`, `fetch:parks`, `seed:pois`, `seed:parks`, `reach:build`, `reach:calibrate`, `reach:publish`. `GET /reach` serves the stored Brotli payload as it is (ETag, `304`, `404 No reach data for this city`); `GET /reach/:cellId` is the block card.
- **Rebuild rule:** place ids change on every reload, so **after any `seed:pois` / `seed:parks` for a city, rerun `reach:build`, `reach:calibrate` and `reach:publish` for it.** `reach:build` deletes the city's calibration and payload, so its endpoints 404 until all three have run.
- **`CITYSCOPE_DB_TARGET`:** every script that writes to a database (`migrate`, `seed:cities`, `seed:pois`, `seed:parks`, `seed:all`, `reach:build`, `reach:calibrate`, `reach:publish`) calls `announceTarget()` and exits unless the variable names the target (`local`, `reach-dev`, `production`). `reach:build --dry-run` runs in a read-only transaction and needs none. `seed.ts` is not guarded yet; it follows once `fix/district-outlines` is merged.
- **Neon-branch workflow:** development writes go to a Neon branch of production called `reach-dev`, whose `DATABASE_URL` lives in `cityscope-backend/.env.reach-dev` (git-ignored by `.env.*`). Run `DOTENV_CONFIG_PATH=.env.reach-dev CITYSCOPE_DB_TARGET=reach-dev npm run <script> -- <city>`. That file replaces `.env`, so it also needs `MAPBOX_TOKEN` for `reach:calibrate`. **Production writes only with the owner's go-ahead** (`CITYSCOPE_DB_TARGET=production`); run read-only production checks inside `BEGIN READ ONLY … ROLLBACK` and confirm `SHOW transaction_read_only` returns `on` before querying (a session `SET default_transaction_read_only` alone isn't reliable on a pooled URL).
- **Never commit** GHSL tiles (`cityscope-backend/data/ghsl/`), park files (`data/parks-*.json`), NHS files or `.env.reach-dev`.

## Conventions

- Strict TypeScript, **no `any`**; type-only imports use `import type`; NodeNext ESM on the backend means relative imports carry a `.js` extension.
- MUI `sx` styling; dark "cartographer's instrument" theme with three colour roles in `cityscope/src/theme.ts`: `ROLE.you` gold (what the user did — pins, drawn areas, selection, actions), `ROLE.answer` cyan (analysis results), `ROLE.context` warm white (heatmap, district lines). **No colour literals outside `theme.ts`** — use a token, or `alpha()`/`darken()` on one; `cityscope/src/colourGuard.test.ts` fails `npm test` otherwise (plain white and black are allowed).
- **Commits: granular, one concern each, NO `Co-Authored-By` trailer.** One concern per branch. The user usually commits themselves.
- New features: brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven execution.

## Environment

- `cityscope/.env.local`: `VITE_MAPBOX_TOKEN`, `VITE_API_URL=http://localhost:3001`
- `cityscope-backend/.env`: `DATABASE_URL` (Neon Postgres+PostGIS), `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`, `CITYSCOPE_DB_TARGET` (set per run, see above), `MAPBOX_TOKEN` (script-only token for `reach:calibrate`; never the frontend's public token)

## Working notes

- The user runs their own frontend server on **:5173**, and backend CORS is pinned there — so **verify the backend with `curl` on :3001** and hand live browser checks to the user (a preview server on another port breaks CORS / `useCities`).
- **Overpass rate-limits (429/504)** — fetch cities sequentially with cooldowns and retry. **Overpass answers 406 without a `User-Agent` header**; `src/lib/overpass.ts` sends `CityScope/1.0 (educational geospatial portfolio)` and retries 429/502/503/504 with doubling waits, so go through `overpassFetch`, not a bare `fetch`.
- All feature work through 2026-08-29 is **merged to `main`** (PR #4): district statistics, polygon draw & analyse, save & share, uncapped POI data, and the README rewrite. The old feature branches are ancestors of `main` and safe to delete. Still confirm what's on `main` vs a branch before assuming, and put new work on its own branch.
- **Deployed:** frontend on Vercel (`city-scope-seven.vercel.app`) → API on **Render** (`cityscope-rzj5.onrender.com`) → Neon PostGIS. Note `cityscope-backend/.env.example` still says Railway; it's wrong. Render's free tier cold-starts at ~8–9 s after idle (warm calls are 300–700 ms), so first-load latency is a known issue, not a bug you've just introduced.
