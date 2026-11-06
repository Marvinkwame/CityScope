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
npm run typecheck:scripts           # type-check all of src except tests (tsconfig.scripts.json), which is what lets it include src/scripts
npm run migrate -- <file>.sql       # apply a migration from src/scripts/migrations/
npm run fetch:pois -- <city>        # fetch POIs from Overpass -> pois-data-<city>.json
npm run seed:all                    # load cities + districts + POIs into the DB

# Everyday reach pipeline, per city, in this order (see "Everyday reach" below)
npm run fetch:parks -- <city>       # parks as shapes from Overpass -> data/parks-<city>.json (git-ignored)
npm run seed:pois -- <city>         # replace one city's POIs
npm run seed:parks -- <city>        # replace one city's parks
npm run reach:build -- <city> [--ghsl <dir>] [--dry-run]   # H3 cells + GHSL residents + nearest place per need
npm run reach:calibrate -- <city>   # fit metres-per-minute against Mapbox walking isochrones (cached in data/isochrones/<city>/; MAPBOX_TOKEN only for uncached cells)
npm run reach:check-gp              # London only, no city argument: its OSM doctors vs NHS GP practices (reads data/nhs/epraccur.csv, calls postcodes.io); run after calibrate, before publish
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

`GET /pois` returns the whole city's POI set (about 2.6 MB Berlin and 5.4 MB Tokyo of uncompressed JSON since the 2026-10-20 refetch; these are estimates, not API measurements, computed from the committed `pois-data-*.json` as compact JSON of the 17 displayed categories with an id per row, a method that reproduces the 2.07 MB measured on Berlin's live `/pois` before the refetch) and is fetched **only when the heatmap layer is on** — it feeds the heatmap and the 300 m spotlight, nothing else. The isochrone POI-in-band join runs server-side via `/pois/in-isochrone` (`ST_Within` per contour), so it never needs the bulk set. POI routes leave out the measurement-only categories (`tram_stop`, `subway_entrance`); the heatmap draws only the original 11 categories, the spotlight lists all 17 displayed ones.

## Everyday reach (Phase 1 data and API built and checked on a local database; no city is published on production yet; the map layer is Phase 2)

Spec: `docs/superpowers/specs/2026-10-17-everyday-reach-design.md` (with an "Amendments while building Phase 1" section — read it before changing the pipeline).

- **Status:** all eight cities were built, calibrated and published on 2026-10-20 on a throwaway local PostgreSQL 18.1 / PostGIS 3.6.2 cluster (localhost:55432, `DOTENV_CONFIG_PATH=.env.local-pg`, `CITYSCOPE_DB_TARGET=local-pg`) standing in for the `reach-dev` Neon branch. The results are in the spec's "Measured results". **Production has not been reloaded:** migration 004 and the per-city reload follow the merge, from the plan's production runbook, each step with the owner's go-ahead. Until then the deployed API serves no reach data.
- **Migrations:** `003` repairs invalid district outlines (applied to production 2026-10-16; the file is on `fix/district-outlines` and reaches other branches once that is merged to `main`). `004-everyday-reach.sql` adds a `GIST ((geom::geography))` index on `pois` and the tables `parks`, `reach_cells`, `reach_nearest`, `reach_calibration` and `reach_payloads`.
- **Pipeline** (per city): `fetch:pois`, `fetch:parks`, `seed:pois`, `seed:parks`, `reach:build`, `reach:calibrate`, `reach:publish`. `GET /reach` serves the stored payload, Brotli when the client accepts it and decompressed otherwise (ETag, `304`, `404 No reach data for this city`, which it also answers before migration 004); `GET /reach/:cellId` is the block card. `reach:check-gp` is London-only and optional: it stores the GP-practice check in London's `reach_calibration.checks`, and `reach:publish` copies it into the payload, so it runs between `reach:calibrate` and `reach:publish`.
- **Rebuild rule:** place ids change on every reload, so **after any `seed:pois` / `seed:parks` for a city, or `seed:all` (which reseeds every city's places and districts), rerun `reach:build`, `reach:calibrate` and `reach:publish` for each city reloaded** (and `reach:check-gp` for London, between calibrate and publish). `seed:pois` and `seed:parks` enforce it: when the reach tables exist they delete the city's reach cells (with their nearest places), calibration and payload in the reload's transaction, so a reload can never leave a stale card or payload. `reach:build` deletes the city's calibration (with the GP check) and payload, and `reach:calibrate` deletes the payload, so `GET /reach` 404s until `reach:publish` has run, while the block card `GET /reach/:cellId` answers once `reach:build` and `reach:calibrate` have run.
- **`CITYSCOPE_DB_TARGET`:** every script that writes to a database (`migrate`, `seed`, `seed:cities`, `seed:pois`, `seed:parks`, `seed:all`, `reach:build`, `reach:calibrate`, `reach:publish`, `reach:check-gp`) calls `announceTarget()`, which exits unless the variable is a non-empty label and then prints `Writing to <label> (<database host>)`. **It is only a label you type: nothing compares it with `DATABASE_URL`, so it does not verify the target. Read the printed host.** `local` may stay in `.env` only while that file's `DATABASE_URL` is a local database; the owner's `.env` points at the production Neon database, so there it should stay empty and any other target (`reach-dev`, `production`) is set per run. `reach:build --dry-run` runs in a read-only transaction and needs none.
- **Neon-branch workflow (planned; Phase 1 used the local stand-in under Status instead):** development writes go to a Neon branch of production called `reach-dev`, whose `DATABASE_URL` lives in `cityscope-backend/.env.reach-dev` (git-ignored by `.env.*`). Run `DOTENV_CONFIG_PATH=.env.reach-dev CITYSCOPE_DB_TARGET=reach-dev npm run <script> -- <city>`. That file replaces `.env`, so it also needs `MAPBOX_TOKEN` for `reach:calibrate`. **Production writes only with the owner's go-ahead** (`CITYSCOPE_DB_TARGET=production`); run read-only production checks on one connection inside `BEGIN READ ONLY … ROLLBACK`, and run `SHOW transaction_read_only` inside that transaction, on that same connection, before the check queries: it must return `on` (a session `SET default_transaction_read_only` alone isn't reliable on a pooled URL, and a `SHOW` outside the transaction or on another pooled connection proves nothing).
- **Never commit** GHSL tiles (`cityscope-backend/data/ghsl/`), park files (`data/parks-*.json`), NHS files or `.env.reach-dev`.

## Conventions

- Strict TypeScript, **no `any`**; type-only imports use `import type`; NodeNext ESM on the backend means relative imports carry a `.js` extension.
- MUI `sx` styling; dark "cartographer's instrument" theme with three colour roles in `cityscope/src/theme.ts`: `ROLE.you` gold (what the user did — pins, drawn areas, selection, actions), `ROLE.answer` cyan (analysis results), `ROLE.context` warm white (heatmap, district lines). **No colour literals outside `theme.ts`** — use a token, or `alpha()`/`darken()` on one; `cityscope/src/colourGuard.test.ts` fails `npm test` otherwise (plain white and black are allowed).
- **Commits: granular, one concern each, NO `Co-Authored-By` trailer.** One concern per branch. The user usually commits themselves.
- New features: brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven execution.

## Environment

- `cityscope/.env.local`: `VITE_MAPBOX_TOKEN`, `VITE_API_URL=http://localhost:3001`
- `cityscope-backend/.env`: `DATABASE_URL` (Neon Postgres+PostGIS), `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`, `CITYSCOPE_DB_TARGET` (leave it empty here, since this `DATABASE_URL` is production: set it per run, see above), `MAPBOX_TOKEN` (script-only token for `reach:calibrate`; never the frontend's public token)

## Working notes

- The user runs their own frontend server on **:5173**, and backend CORS is pinned there — so **verify the backend with `curl` on :3001** and hand live browser checks to the user (a preview server on another port breaks CORS / `useCities`).
- **Overpass rate-limits (429/504)** — fetch cities sequentially with cooldowns and retry. **Overpass answers 406 without a `User-Agent` header**; `src/lib/overpass.ts` sends `CityScope/1.0 (educational geospatial portfolio)` and retries 429/502/503/504, network errors and a 200 carrying a "runtime error" remark (a partial answer) with doubling waits, so go through `overpassFetch`, not a bare `fetch`. `seed:pois` and `seed:parks` refuse an empty input rather than replace a city with nothing.
- All feature work through 2026-08-29 is **merged to `main`** (PR #4): district statistics, polygon draw & analyse, save & share, uncapped POI data, and the README rewrite. The old feature branches are ancestors of `main` and safe to delete. Still confirm what's on `main` vs a branch before assuming, and put new work on its own branch.
- **Deployed:** frontend on Vercel (`city-scope-seven.vercel.app`) → API on **Render** (`cityscope-rzj5.onrender.com`) → Neon PostGIS. Note `cityscope-backend/.env.example` still says Railway; it's wrong. Render's free tier cold-starts at ~8–9 s after idle (warm calls are 300–700 ms), so first-load latency is a known issue, not a bug you've just introduced.
