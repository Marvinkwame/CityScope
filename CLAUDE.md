# CityScope

Full-stack **geospatial analytics** platform: explore urban density and reachability across **8 cities** using real OpenStreetMap data, built out of an interest in maps and urban analytics. Keep the code, docs and README clear for a technical reader.

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
npm run fetch:streets -- <city> [--tile 0.1]   # walkable ways from Overpass in 0.1° tiles -> data/streets-<city>.json (git-ignored)
npm run seed:pois -- <city>         # replace one city's POIs
npm run seed:parks -- <city>        # replace one city's parks
npm run reach:build -- <city> [--method network|estimate] [--ghsl <dir>] [--dry-run]   # H3 cells + GHSL residents + nearest place per need, along the streets by default (network) with each walk's line
npm run reach:calibrate -- <city>   # fit metres-per-minute against Mapbox walking isochrones (cached in data/isochrones/<city>/; MAPBOX_TOKEN only for uncached cells)
npm run reach:check-gp              # London only, no city argument: its OSM doctors vs NHS GP practices (reads data/nhs/epraccur.csv, calls postcodes.io); run after calibrate, before publish
npm run reach:publish -- <city>     # compress the city's payload into reach_payloads
npm run reach:compare -- <city>     # read-only: one README row, data/reach-before/<city>.json vs the published payload
```

**CI:** `.github/workflows/ci.yml` runs on every pull request and every push to `main`, on Node 22: frontend `npm ci`, `lint`, `test`, `build`; backend `npm ci`, `build`, `typecheck:scripts`, `test`. No test may need a database, a token or a git-ignored data file, or CI fails.

## Architecture

- **Map isolation:** ALL Mapbox source/layer/control/marker mutations live in `cityscope/src/components/MapView.tsx` and react to store changes via `useEffect`. UI writes to Zustand stores; the map reads from them.
- **Imperative store reads in map event handlers** (`useStore.getState()`) to dodge stale closures inside GL JS's event system.
- **PostGIS is a spatial engine, not just a store.** `pois` has a generated `geom geometry(Point,4326)` column + **GiST index** (migration `002`). District stats and drawn-area analysis run server-side via `ST_Contains` / `ST_Within` / `ST_Area(::geography)`. Lightweight proximity (300 m spotlight) uses Turf.js client-side.
- **Stores** (`cityscope/src/store/`): `cityStore`, `layerStore`, `mapStore`, `isochroneStore`, `routeStore`, `drawStore`, `featureStore`, `heatmapStore`, `geoSearchStore`, `uiStore`, `reachStore` (Everyday reach: switch, minutes, needs, selected block; not a `LayerId`). Analysis tools (isochrone/route/draw) are **mutually exclusive** — each control disables the others via `getState()`.
- **Everyday reach excludes the heatmap and the three tools** (`lib/viewExclusivity.ts`): turning reach on turns them off, and turning any of them on turns reach off. The heatmap and the tools still coexist with each other.
- **One within rule for reach:** a place is within T minutes when `metres ≤ T × k`, on the payload's metres and its `k` (`isWithin` in `lib/reach/summary.ts`). The block colours, the headline and the block card's minutes and ✓/✗ all use it; the card endpoint supplies only names, categories, positions and (in a street build) each walk's line, and the card says so when its metres or `k` differ from the payload's.
- **A reach selection never changes a filter or a data-driven paint property on the reach source** (either makes Mapbox reload every tile). The 2D outline is two line layers on a one-block source of its own; the selected 3D column turns gold through feature state `selected`. The reach source's feature ids are each block's index in the payload, not `promoteId: 'h'`: Mapbox hashes a string id to 32 bits, so two blocks could share their state.
- **District outlines draw above the reach layer** (`reachBeforeId` in `lib/layerOrder.ts`), a deliberate exception to "context under answers".
- **TanStack Query** for all async data (isochrone, route, geocode, districts, pois, district stats, area analysis, reach payload, reach block card) with `queryKey` caching + `enabled` guards.
- **Save & Share:** app state → base64url blob in the URL hash (`cityscope/src/lib/shareCodec.ts` + `shareState.ts` + `useShareSync.ts`), rehydrated on load behind a hydration guard. An optional `reach` entry, separate from `layers`, carries `t` (5/10/15/20), `n` (need keys) and `c` (an optional H3 block); an invalid `t` or `n` drops it, an invalid `c` drops only `c`, and a tool or the heatmap in the same link wins over it (`effectiveReach`).

### Key API endpoints (city-scoped, `:cityId` e.g. `berlin`)
`GET /api/cities` · `GET /api/cities/:cityId/districts` · `GET /api/cities/:cityId/districts/:id/stats` · `GET /api/cities/:cityId/pois` · `POST /api/cities/:cityId/pois/within` · `POST /api/cities/:cityId/pois/in-isochrone` · `GET /api/cities/:cityId/reach` · `GET /api/cities/:cityId/reach/:cellId`

`GET /pois` returns the whole city's POI set (about 2.6 MB Berlin and 5.4 MB Tokyo of uncompressed JSON since the 2026-10-20 refetch; these are estimates, not API measurements, computed from the committed `pois-data-*.json` as compact JSON of the 17 displayed categories with an id per row, a method that reproduces the 2.07 MB measured on Berlin's live `/pois` before the refetch) and is fetched **only when the heatmap layer is on** — it feeds the heatmap and the 300 m spotlight, nothing else. The isochrone POI-in-band join runs server-side via `/pois/in-isochrone` (`ST_Within` per contour), so it never needs the bulk set. POI routes leave out the measurement-only categories (`tram_stop`, `subway_entrance`); the heatmap draws only the original 11 categories, the spotlight lists all 17 displayed ones.

## Everyday reach (live on production for all eight cities, measured along the streets since 2026-11-26)

Spec: `docs/superpowers/specs/2026-10-17-everyday-reach-design.md` (with "Amendments while building Phase 1" and "Amendments while building Phase 2" sections — read them before changing the pipeline or the layer). Phase 2 plan: `docs/superpowers/plans/2026-11-06-everyday-reach-phase-2-interface.md`. Walking by street: spec `docs/superpowers/specs/2026-11-21-street-network-walking-design.md` (its "Measured results" hold the before and after), plan `docs/superpowers/plans/2026-11-21-everyday-reach-by-street.md`.

- **By-street status:** built on `reach/street-network` on 2026-11-21, merged as PR #22, and **live on production for all eight cities** (Sydney 2026-11-24, the rest 2026-11-26). `reach:build` now measures along each city's OSM walking network by default (`--method network`; `--method estimate` is the old straight line): a typed-array graph of the network's largest connected part (`lib/streetGraph.ts`), a grid node index (`lib/nodeIndex.ts`), one multi-source Dijkstra per need from all its places (`lib/multiSourceSearch.ts`, ties by place order), parks entered at points every 25 m along the edge (`lib/networkNearest.ts`), and each walk simplified to 2 m (`lib/walks.ts`) and stored in `reach_nearest.walk`. A block joins its single nearest node: joining the best node within 50–150 m was measured and agrees *less* with Mapbox in Paris, Berlin and London. The payload keeps its format and adds `meta.method` and the street source dates; the card adds `walk`; the frontend draws walks and words the method note by `meta.method`, and a card whose metres or `k` differ from the payload's refetches both once per payload version and block with `cache: 'reload'` (`useReachCard`). All eight cities were built, calibrated and published by street on the local stand-in, then on production through the plan's Task 13, each stage with the owner's go-ahead: a Neon rollback branch `pre-street-2026-11-23` (the owner may delete it once settled), migration 005 before the merge, then build, calibrate, the GP check for London and publish per city from the local street files and the Mapbox cache (0 requests). Every production payload matched the local build block for block, differing only in `builtAt` and `sources.calibratedAt`; each city's map was unavailable 18–51 s (build commit to publish); the deployed API passed 99 of 99 checks; the database grew from 171 MB to 272 MB. Details in the street spec's "The production run". The owner chose street distances for Sydney too, although its 5-minute agreement dips (90.0% vs 91.7%, within chance).

- **Phase 2 status:** the map layer was built on `reach/interface` on 2026-11-06: the fifth sidebar switch with its panel (headline, range, time stops, need toggles, per-need bars, legend, method note), the block colours and 3D columns, the block card and phone card, lines and pins to a block's nearest places, the `reach` share-link entry and the Tokyo welcome example. Code: `cityscope/src/lib/reach/`, `cityscope/src/components/reach/`, `cityscope/src/store/reachStore.ts`, and the reach parts of `MapView.tsx`. The recolouring measurement (plan Task 1) and the live browser checks (Task 12) ran on 2026-11-06; their results are in the spec's Phase 2 amendments. The deployed frontend gets the layer only once the branch is merged and Vercel redeploys.
- **Phase 1 status:** all eight cities were built, calibrated and published on 2026-10-20 on a throwaway local PostgreSQL 18.1 / PostGIS 3.6.2 cluster (localhost:55432, `DOTENV_CONFIG_PATH=.env.local-pg`, `CITYSCOPE_DB_TARGET=local-pg`) standing in for the `reach-dev` Neon branch (since stopped). The results are in the spec's "Measured results". **Production was loaded on 2026-11-06** through the plan's production runbook, each stage with the owner's go-ahead: a Neon rollback branch `pre-reach-2026-11-06` (the owner may delete it), migration 004, then `seed:pois`, `seed:parks`, `reach:build`, `reach:calibrate` and `reach:publish` per city from the committed place files, the 2026-10-20 park files and the Mapbox cache (0 Mapbox requests), and `reach:check-gp` with London republished. Every city's production payload matched the local run block for block, differing only in its two timestamps; the deployed API passed 71 of 71 checks, and the database grew from 67 MB to 171 MB. Production writes use `cityscope-backend/.env.production-direct` (git-ignored; `.env`'s database with the direct, non-pooler Neon host, which the runbook requires for long write transactions): `DOTENV_CONFIG_PATH=.env.production-direct CITYSCOPE_DB_TARGET=production npm run <script>`.
- **Migrations:** `003` repairs invalid district outlines (applied to production 2026-10-16). `004-everyday-reach.sql` (applied to production 2026-11-06) adds a `GIST ((geom::geography))` index on `pois` and the tables `parks`, `reach_cells`, `reach_nearest`, `reach_calibration` and `reach_payloads`. `005-reach-walks.sql` (applied to production 2026-11-23) adds `reach_nearest.walk geometry(LineString,4326)` with a check that every `network` row has a walk (`reach_nearest_walk_for_network`).
- **Pipeline** (per city): `fetch:pois`, `fetch:parks`, `fetch:streets`, `seed:pois`, `seed:parks`, `reach:build`, `reach:calibrate`, `reach:publish` (then optionally `reach:compare`). `GET /reach` serves the stored payload, Brotli when the client accepts it and decompressed otherwise (ETag, `304`, `404 No reach data for this city`, which it also answers before migration 004); `GET /reach/:cellId` is the block card. `reach:check-gp` is London-only and optional: it stores the GP-practice check in London's `reach_calibration.checks`, and `reach:publish` copies it into the payload, so it runs between `reach:calibrate` and `reach:publish`.
- **Rebuild rule:** place ids change on every reload, so **after any `seed:pois` / `seed:parks` for a city, or `seed:all` (which reseeds every city's places and districts), rerun `reach:build`, `reach:calibrate` and `reach:publish` for each city reloaded** (and `reach:check-gp` for London, between calibrate and publish). `seed:pois` and `seed:parks` enforce it: when the reach tables exist they delete the city's reach cells (with their nearest places), calibration and payload in the reload's transaction, so a reload can never leave a stale card or payload. `reach:build` deletes the city's calibration (with the GP check) and payload, and `reach:calibrate` deletes the payload, so `GET /reach` 404s until `reach:publish` has run, while the block card `GET /reach/:cellId` answers once `reach:build` and `reach:calibrate` have run. **A new street file changes the walks too: after `fetch:streets` for a city, rerun `reach:build`, `reach:calibrate` (and `reach:check-gp` for London) and `reach:publish`.**
- **`CITYSCOPE_DB_TARGET`:** every script that writes to a database (`migrate`, `seed`, `seed:cities`, `seed:pois`, `seed:parks`, `seed:all`, `reach:build`, `reach:calibrate`, `reach:publish`, `reach:check-gp`) calls `announceTarget()`, which exits unless the variable is a non-empty label and then prints `Writing to <label> (<database host>)`. **It is only a label you type: nothing compares it with `DATABASE_URL`, so it does not verify the target. Read the printed host.** `local` may stay in `.env` only while that file's `DATABASE_URL` is a local database; the owner's `.env` points at the production Neon database, so there it should stay empty and any other target (`reach-dev`, `production`) is set per run. `reach:build --dry-run` runs in a read-only transaction and needs none.
- **Neon-branch workflow (planned; Phase 1 used the local stand-in under Status instead):** development writes go to a Neon branch of production called `reach-dev`, whose `DATABASE_URL` lives in `cityscope-backend/.env.reach-dev` (git-ignored by `.env.*`). Run `DOTENV_CONFIG_PATH=.env.reach-dev CITYSCOPE_DB_TARGET=reach-dev npm run <script> -- <city>`. That file replaces `.env`, so it also needs `MAPBOX_TOKEN` for `reach:calibrate`. **Production writes only with the owner's go-ahead** (`CITYSCOPE_DB_TARGET=production`); run read-only production checks on one connection inside `BEGIN READ ONLY … ROLLBACK`, and run `SHOW transaction_read_only` inside that transaction, on that same connection, before the check queries: it must return `on` (a session `SET default_transaction_read_only` alone isn't reliable on a pooled URL, and a `SHOW` outside the transaction or on another pooled connection proves nothing).
- **Never commit** GHSL tiles (`cityscope-backend/data/ghsl/`), park files (`data/parks-*.json`), street files (`data/streets-*`), the saved before payloads (`data/reach-before/`), NHS files or `.env.*` other than `.env.example`.

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
- **Overpass rate-limits (429/504)** — fetch cities sequentially with cooldowns and retry. **Overpass answers 406 without a `User-Agent` header**; `src/lib/overpass.ts` sends `CityScope/1.0 (educational geospatial project)` and retries 429/502/503/504, network errors and a 200 carrying a "runtime error" remark (a partial answer) with doubling waits, so go through `overpassFetch`, not a bare `fetch`. `seed:pois` and `seed:parks` refuse an empty input rather than replace a city with nothing.
- All feature work through 2026-08-29 is **merged to `main`** (PR #4): district statistics, polygon draw & analyse, save & share, uncapped POI data, and the README rewrite. The old feature branches are ancestors of `main` and safe to delete. Still confirm what's on `main` vs a branch before assuming, and put new work on its own branch.
- **Deployed:** frontend on Vercel (`city-scope-seven.vercel.app`) → API on **Render** (`cityscope-rzj5.onrender.com`) → Neon PostGIS. Render's free tier cold-starts at ~8–9 s after idle (warm calls are 300–700 ms), so first-load latency is a known issue, not a bug you've just introduced.
