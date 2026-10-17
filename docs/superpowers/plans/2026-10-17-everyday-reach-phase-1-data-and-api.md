# Everyday Reach, Phase 1 (Data and API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data pipeline and the two API endpoints behind Everyday reach:
- six everyday needs;
- residents per H3 cell;
- the nearest place to each need from every cell;
- a calibrated walking estimate;
- a stored, compressed payload.

All of it is developed and verified end to end on a Neon branch before production is touched.

**Architecture:**
- **Pure, tested logic in `cityscope-backend/src/lib/`:** categories, needs, population aggregation, sampling, calibration, the payload, HTTP helpers.
- **Thin scripts in `src/scripts/`** do the I/O: Overpass, GHSL GeoTIFFs, Mapbox, Postgres.
- **One read-only router** serves the stored payloads.
- **Writing scripts refuse to run** unless `CITYSCOPE_DB_TARGET` names the target. Development runs against a Neon branch (`.env.reach-dev`). Production runs only after merge, from the runbook at the end.

**Tech Stack:**
- **Backend:** Node, TypeScript (NodeNext ESM), Express 5, `pg`, PostGIS 3.6 on Neon, Vitest 4.
- **New dev dependencies:** `h3-js@4.5.0`, `geotiff@3.0.5`, `osmtogeojson@3.0.0-beta.5`.
- **Frontend touch only:** React 19, MUI 7 icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-everyday-reach-design.md`. Read it first; this plan argues from it.

## Global Constraints

**Code conventions**
- Strict TypeScript: no `any`, and `import type` for type-only imports. Backend relative imports end in `.js`, except test files, which import without an extension as the existing tests do.
- No colour literals outside `cityscope/src/theme.ts`.

**Commits**
- No `Co-Authored-By` trailer, and no other trailer.
- Stage by explicit path, never `git add -A`. One concern per commit.

**Databases and servers**
- Every script that writes to a database calls `announceTarget()` (Task 1) before connecting: `seed-pois`, `migrate`, `seed-parks`, `build-reach` (unless `--dry-run`), `calibrate-reach`, `publish-reach` and `check-gp-coverage`.
- Nothing in this plan writes to production. Every database write in Tasks 5–14 targets the Neon branch: `DOTENV_CONFIG_PATH=.env.reach-dev` with `CITYSCOPE_DB_TARGET=reach-dev`.
- Never start, stop or restart the owner's dev servers (:5173, :3001). Live API checks load the app in a one-off process on a spare port that exits by itself.

**Data files**
- Never commit GHSL tiles, park files, NHS files or `.env.reach-dev`.

**Overpass**
- Every request sends `User-Agent: CityScope/1.0 (educational geospatial portfolio)`, or Overpass answers 406.
- Cities are fetched one at a time, with ≥ 30 s cooldowns.
- Retry on 429/502/503/504.

**Values the spec fixes**
- Need keys: `sm` `ph` `dr` `sc` `pk` `st`, in that order.
- Park minimum: **5000 m²** (0.5 ha). Fetch margin: **2 km**. H3 resolution: **9**.
- Bands: **5, 10, 15, 20**. Bar: **0.8**. Sample: **60** cells (first 30 fit, last 30 held out). Bootstrap: **200** rounds, 5th/95th percentile. Seed: **20261017**.
- Mapbox `generalize=0`. Brotli quality **11**. `Cache-Control: public, max-age=86400`.
- Coordinates to **5** decimals. Target for London's compressed payload: ≤ **450 KB**.

**Copy**
- Coverage labels: Berlin "whole city", London "all 33 boroughs", Paris "the 20 arrondissements", New York "the five boroughs", Tokyo "the 23 wards", Amsterdam "whole city", Munich "whole city", Sydney "33 inner suburbs".

## Review Focus

1. **London straddles two GHSL tiles** (R4_C18 and R4_C19, either side of 0° longitude). Residents must add up across both, with no gap and no double count at the seam. *Test in Task 8:* `two adjacent tiles add into one map without double counting`.
2. **GHSL "no data" pixels (negative values such as −200, or NaN) count as zero residents.** They must never subtract population. *Test in Task 8:* `ignores no-data and negative pixels`.
3. **A city with no place for some need** gets `NONE_FOUND_METRES` (65535) for that need in every cell. That is not a crash and not a missing property, and calibration treats it as "outside". *Tests:* Task 10 `a none-found distance is predicted outside`; Task 11 `writes NONE_FOUND for a need with no nearest row`.
4. **A client that doesn't accept Brotli** (curl's default, some proxies) gets plain JSON with no `Content-Encoding`. *Tests in Task 12:* the `acceptsBrotli` cases, plus the live check without the header.
5. **A writing script run against the wrong database** aborts before connecting unless `CITYSCOPE_DB_TARGET` is set, and prints which host it will write to. *Test in Task 1:* `requireDbTarget throws when unset`.

## Before Task 5: owner setup (controller relays this; subagents can't do it)

1. In the Neon console, create branch **`reach-dev`** from `main`, then copy its connection string.
2. Create `cityscope-backend/.env.reach-dev`. Task 1 makes it gitignored. It needs:
   ```
   DATABASE_URL=<reach-dev connection string>
   CITYSCOPE_DB_TARGET=reach-dev
   MAPBOX_TOKEN=<a script-only Mapbox token>
   ```
3. Prerequisite merges: `chore/keep-warm` and `fix/district-outlines` are on `main`, and this branch has merged `main`, so migration 003 and the `seed.ts` guard are present.

Every branch command below runs from `cityscope-backend/` as `DOTENV_CONFIG_PATH=.env.reach-dev npm run <script> -- <args>`.

---

### Task 1: Safety rails and tooling

**Files:**
- Create: `cityscope-backend/src/lib/dbTarget.ts`, `cityscope-backend/src/lib/dbTarget.test.ts`
- Create: `cityscope-backend/.gitignore`, `cityscope-backend/tsconfig.scripts.json`
- Modify: `cityscope-backend/package.json` (add the script `"typecheck:scripts": "tsc -p tsconfig.scripts.json"`)
- Modify: `cityscope-backend/src/scripts/seed-pois.ts`, `cityscope-backend/src/scripts/migrate.ts` (call the guard first)

**Interfaces:**
- Produces:
  - `requireDbTarget(env?: NodeJS.ProcessEnv): string`. Throws `Error('Set CITYSCOPE_DB_TARGET (e.g. reach-dev, production) before writing to a database')` when it is unset or blank.
  - `describeDatabase(url: string | undefined): string`. Returns the host only, never the user or password; `'(no DATABASE_URL)'` when undefined.
  - `announceTarget(): string`. Calls both and logs `Writing to <target> (<host>)`.

- [ ] **Step 1: Write the failing tests** in `dbTarget.test.ts`:
  - `requireDbTarget throws when unset`: `expect(() => requireDbTarget({})).toThrow(/CITYSCOPE_DB_TARGET/)`, and the same for `{ CITYSCOPE_DB_TARGET: '  ' }`;
  - `returns the target`: `requireDbTarget({ CITYSCOPE_DB_TARGET: 'reach-dev' })` is `'reach-dev'`;
  - `describeDatabase strips credentials`: `describeDatabase('postgresql://u:secret@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require')` is `'ep-x.eu-central-1.aws.neon.tech'`, and the result doesn't contain `'secret'`;
  - `describeDatabase(undefined)` is `'(no DATABASE_URL)'`.
- [ ] **Step 2: Run** `cd cityscope-backend && npx vitest run src/lib/dbTarget.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `dbTarget.ts` with the three functions above. In `seed-pois.ts` and `migrate.ts`, call `announceTarget()` as the first line of `main`/`seed`, before connecting.
- [ ] **Step 4: Add the tooling files.**
  - `.gitignore`: `.env.*`, `!.env.example` and `data/`.
  - `tsconfig.scripts.json`: `{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "include": ["src"], "exclude": ["node_modules", "dist", "src/**/*.test.ts"] }`.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: all pass, with the 50 existing tests plus the new ones. `git check-ignore -v .env.reach-dev data/x.tif` reports both as ignored.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/lib/dbTarget.ts cityscope-backend/src/lib/dbTarget.test.ts cityscope-backend/.gitignore cityscope-backend/tsconfig.scripts.json cityscope-backend/package.json cityscope-backend/src/scripts/seed-pois.ts cityscope-backend/src/scripts/migrate.ts
  git commit -m "chore(data): writing scripts name their database, and scripts get a type check"
  ```

### Task 2: Needs and the new tagging rules

**Files:**
- Modify: `cityscope-backend/src/lib/poiCategories.ts`, `cityscope-backend/src/lib/poiCategories.test.ts`
- Create: `cityscope-backend/src/lib/needs.ts`, `cityscope-backend/src/lib/needs.test.ts`

**Interfaces:**
- Produces (`poiCategories.ts`):
  - `POI_CATEGORIES: readonly PoiCategory[]`, with 19 values;
  - `classifyPoi(tags): PoiCategory | null`;
  - `buildOverpassQuery(bbox: string): string`, signature unchanged.
- Produces (`needs.ts`):
  ```ts
  export type NeedId = 'sm' | 'ph' | 'dr' | 'sc' | 'pk' | 'st';
  export interface Need { id: NeedId; label: string; source: 'pois' | 'parks'; categories: readonly string[] }
  export const NEEDS: readonly Need[];            // order: sm, ph, dr, sc, pk, st
  export const NEED_IDS: readonly NeedId[];
  export const MEASUREMENT_ONLY_CATEGORIES: readonly string[]; // ['tram_stop', 'subway_entrance']
  export const PARK_MIN_AREA_M2 = 5000;
  export const NONE_FOUND_METRES = 65535;
  ```
  The labels are Supermarket, Pharmacy, Doctor, School, Park, Station. The categories:
  - `sm`: `['supermarket']`
  - `ph`: `['pharmacy']`
  - `dr`: `['doctors', 'clinic']`
  - `sc`: `['school']`
  - `pk`: `[]`, with source `'parks'`
  - `st`: `['station', 'halt', 'tram_stop', 'subway_entrance']`

  **Deviation from the spec table:** `healthcare=doctor` is stored as `doctors`, so the separate `doctor` category never exists. Otherwise the lists would show two "Doctor" rows. Record this in the Task 15 amendments.

- [ ] **Step 1: Write the failing tests.**
  - **Update `POI_CATEGORIES is exactly …`** to the sorted 19 values: `['attraction','bakery','bar','cafe','clinic','doctors','halt','hotel','museum','park','pharmacy','playground','pub','restaurant','school','station','subway_entrance','supermarket','tram_stop']`.
  - **Add `classifies the new tags`:**
    - `{amenity:'pharmacy'}` → `pharmacy`, `{healthcare:'pharmacy'}` → `pharmacy`;
    - `{amenity:'doctors'}` → `doctors`, `{healthcare:'doctor'}` → `doctors`, `{healthcare:'clinic'}` → `clinic`, `{amenity:'clinic'}` → `clinic`;
    - `{amenity:'school'}` → `school`;
    - `{railway:'station'}` → `station`, `{railway:'halt'}` → `halt`, `{railway:'tram_stop'}` → `tram_stop`, `{railway:'subway_entrance'}` → `subway_entrance`.
  - **Add `rejects near misses`**, each giving `null`:
    - `{railway:'platform'}`, `{railway:'subway'}`;
    - `{healthcare:'dentist'}`;
    - `{amenity:'kindergarten'}`, `{amenity:'university'}`;
    - `{railway:'station', station:'miniature'}`, a park railway, not transport.
  - **Add `keeps tag priority`:** `{amenity:'cafe', railway:'station'}` → `cafe`, and `{amenity:'pharmacy', healthcare:'pharmacy'}` → `pharmacy`.
  - **Add `queries the new tags`.** The query contains both:
    - `nwr["railway"~"(^|;)(station|halt|tram_stop|subway_entrance)(;|$)"]`
    - `nwr["healthcare"~"(^|;)(pharmacy|doctor|clinic)(;|$)"]`
  - **In `needs.test.ts`:**
    - `NEED_IDS` equals `['sm','ph','dr','sc','pk','st']`;
    - every category of every `pois` need is in `POI_CATEGORIES`;
    - `pk` has source `parks` and no categories;
    - `MEASUREMENT_ONLY_CATEGORIES` is a subset of the `st` categories;
    - `PARK_MIN_AREA_M2` is `5000`, and `NONE_FOUND_METRES` is `65535`.
- [ ] **Step 2: Run** `npx vitest run src/lib/poiCategories.test.ts src/lib/needs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Extend the rules in this priority order: amenity (adds `pharmacy`, `doctors`, `clinic`, `school`), then tourism, leisure, shop, `railway` (`station`, `halt`, `tram_stop`, `subway_entrance`), and `healthcare` (`pharmacy`, `doctor`, `clinic`, mapped to output `pharmacy`, `doctors`, `clinic`).
  - A rule may carry an output map; keep `PoiCategory` as the union of *output* values.
  - The miniature check: a `railway` match is rejected when `tags.station === 'miniature'`.
  - `needs.ts` is plain data.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add cityscope-backend/src/lib/poiCategories.ts cityscope-backend/src/lib/poiCategories.test.ts cityscope-backend/src/lib/needs.ts cityscope-backend/src/lib/needs.test.ts
  git commit -m "feat(data): six everyday needs and the tags behind them"
  ```

### Task 3: Keep measurement-only categories out of place lists

**Files:** Modify `cityscope-backend/src/routes/pois.ts` and `cityscope-backend/src/routes/districts.ts`.

**Interfaces:** Consumes `MEASUREMENT_ONLY_CATEGORIES` (Task 2).

- [ ] **Step 1: Add the filter.** Each place below gets `AND <alias>.category <> ALL($n::text[])`, with `[...MEASUREMENT_ONLY_CATEGORIES]` passed as the next parameter:
  - `GET /pois` (`WHERE city_id = $1 AND category <> ALL($2::text[])`);
  - the `inside` CTE in `POST /within`;
  - the `JOIN` in `POST /in-isochrone`;
  - in the district statistics, the `inside` CTE and the `per_district` `LEFT JOIN` condition, so density and the city average count places, not tram stops.
- [ ] **Step 2: Update the two "Every category (there are 11)" SQL comments** to say "every displayed category".
- [ ] **Step 3: Run** `npx vitest run && npx tsc --noEmit`. Expected: PASS. The live proof is in Task 13, after the branch holds tram stops.
- [ ] **Step 4: Commit**
  ```bash
  git add cityscope-backend/src/routes/pois.ts cityscope-backend/src/routes/districts.ts
  git commit -m "feat(api): place lists leave out tram stops and metro entrances"
  ```

### Task 4: The new categories in the frontend

**Files:**
- Modify: `cityscope/src/components/results/categoryIcons.ts` and `categoryIcons.test.ts`
- Modify: `cityscope/src/components/results/format.ts` and `format.test.ts`
- Modify: `cityscope/src/lib/heatmapExposure.ts` and `heatmapExposure.test.ts`
- Modify: `cityscope/src/components/MapView.tsx` (the heatmap source effect only)

**Interfaces:**
- Produces:
  - `HEATMAP_CATEGORIES: ReadonlySet<string>`, the original 11;
  - `heatmapPoints<T extends { category: string }>(pois: readonly T[]): T[]`;
  - `categoryLabel(category)`, now with overrides `{ doctors: 'Doctor', halt: 'Rail halt' }`.

- [ ] **Step 1: Write the failing tests.**
  - **`categoryIcons.test.ts`:**
    - `CATEGORIES` becomes the 17 *displayed* categories: the old 11 plus `pharmacy`, `doctors`, `clinic`, `school`, `station`, `halt`. Comment: "The backend's displayed categories; tram stops and metro entrances never reach the lists".
    - Keep the uniqueness and exact-keys tests.
    - Add `expect(CATEGORY_ICONS.pharmacy).toBe(LocalPharmacyIcon)` and `expect(CATEGORY_ICONS.station).toBe(TrainIcon)`.
  - **`format.test.ts`:** `categoryLabel('doctors')` is `'Doctor'`, `categoryLabel('halt')` is `'Rail halt'`, and `categoryLabel('school')` is `'School'`.
  - **`heatmapExposure.test.ts`:** `heatmapPoints` keeps `cafe` and `park`, and drops `pharmacy`, `school`, `station` and `doctors`. `HEATMAP_CATEGORIES.size` is `11`.
- [ ] **Step 2: Run** `cd cityscope && npx vitest run src/components/results src/lib/heatmapExposure.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Icons:**
    - `pharmacy: LocalPharmacyIcon`, `doctors: MedicalServicesIcon`, `clinic: LocalHospitalIcon`;
    - `school: SchoolIcon`;
    - `station: TrainIcon`, `halt: DirectionsRailwayIcon`;
    - update the doc comment.
  - **Labels:** a small override map consulted before capitalising.
  - **`MapView.tsx`:** build the heatmap GeoJSON **and** `heatmapWeight` from `heatmapPoints(poisData)`, so the brightness tuning stays on the original categories.
- [ ] **Step 4: Run** `npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint && npm run build`. Expected: all pass. The colour guard is unaffected.
- [ ] **Step 5: Commit**
  ```bash
  git add cityscope/src/components/results/categoryIcons.ts cityscope/src/components/results/categoryIcons.test.ts cityscope/src/components/results/format.ts cityscope/src/components/results/format.test.ts cityscope/src/lib/heatmapExposure.ts cityscope/src/lib/heatmapExposure.test.ts cityscope/src/components/MapView.tsx
  git commit -m "feat(web): icons and labels for the new place categories; the heatmap keeps its eleven"
  ```

### Task 5: Wider fetch boxes, coverage labels, Overpass retries

**Files:**
- Modify: `cityscope-backend/src/config/cities.ts`
- Create: `cityscope-backend/src/config/cities.test.ts`
- Create: `cityscope-backend/src/lib/overpass.ts`, `cityscope-backend/src/lib/overpass.test.ts`
- Modify: `cityscope-backend/src/scripts/fetch-pois.ts`

**Interfaces:**
- **`CityConfig` gains two fields.**
  - `fetchBounds: { south: number; west: number; north: number; east: number }`
  - `reach: { coverage: string; districtNameSuffix?: string }`
- **`fetchBounds` exact values.** Each is the union of the existing `bounds` with the repaired outline's extent plus 2 km, measured on 2026-10-17 (Tokyo: the wards):

  | City | south | west | north | east |
  |---|---|---|---|---|
  | amsterdam | 52.26 | 4.699 | 52.449 | 5.138 |
  | berlin | 52.32 | 13.058 | 52.693 | 13.791 |
  | london | 51.268 | -0.54 | 51.71 | 0.363 |
  | munich | 48.043 | 11.333 | 48.267 | 11.79 |
  | new-york | 40.478 | -74.28 | 40.934 | -73.676 |
  | paris | 48.797 | 2.196 | 48.921 | 2.498 |
  | sydney | -33.99 | 151.0 | -33.69 | 151.4 |
  | tokyo | 35.514 | 139.541 | 35.836 | 139.94 |

  `reach.coverage` uses the Global Constraints labels. Tokyo also gets `districtNameSuffix: ' Ku'`.
- **Produces:** `overpassFetch(query: string, opts?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; retries?: number; baseDelayMs?: number }): Promise<unknown>`.
  - Defaults: `retries` 4, `baseDelayMs` 30000, doubling on each retry.
  - Retries on 429, 502, 503 and 504; throws on any other non-OK status.
  - Sends the pipeline's `User-Agent`, `Content-Type` and `Accept` headers.

- [ ] **Step 1: Write the failing tests.**
  - **`cities.test.ts`:**
    - every city's `fetchBounds` contains its `bounds`, so the download never shrinks;
    - Amsterdam's `fetchBounds.south <= 52.278` and `east >= 5.1077`, which covers the Zuidoost/Weesp outline;
    - Tokyo's `reach.districtNameSuffix` is `' Ku'`;
    - every city has a non-empty `reach.coverage`.
  - **`overpass.test.ts`**, with a fake `fetchImpl` and a no-op `sleep`:
    - `retries a 502 then succeeds`: two calls, and the parsed JSON is returned;
    - `gives up after the retries`: 5 calls, then it throws with `/502/`;
    - `does not retry a 400`: one call, then it throws;
    - `sends the User-Agent`: the header is captured.
- [ ] **Step 2: Run** `npx vitest run src/config/cities.test.ts src/lib/overpass.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the config fields and `overpassFetch`. `fetch-pois.ts` builds its bbox from `fetchBounds` and calls `overpassFetch(buildOverpassQuery(bbox))`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 5: Real check on the branch** (needs the owner setup).
  1. Run `npm run fetch:pois -- berlin` (Overpass only; it writes `src/scripts/pois-data-berlin.json`).
  2. Run `DOTENV_CONFIG_PATH=.env.reach-dev npm run seed:pois -- berlin`. Expected: `Writing to reach-dev (<branch host>)`.
  3. Read-only count by category on the branch. Expected: all 19 categories present for Berlin, with pharmacy around 770, tram_stop around 968, and station plus halt around 400 (the counts measured on 2026-10-16). **Don't commit `pois-data-berlin.json`**; Task 13 commits all eight together.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/config/cities.ts cityscope-backend/src/config/cities.test.ts cityscope-backend/src/lib/overpass.ts cityscope-backend/src/lib/overpass.test.ts cityscope-backend/src/scripts/fetch-pois.ts
  git commit -m "feat(data): fetch each city over its outline plus 2 km, with Overpass retries"
  ```

### Task 6: Migration 004

**Files:** Create `cityscope-backend/src/scripts/migrations/004-everyday-reach.sql`.

**Interfaces (the tables later tasks use):** a single transaction, idempotent (`IF NOT EXISTS`):

```sql
CREATE INDEX IF NOT EXISTS idx_pois_geog ON pois USING GIST ((geom::geography));

CREATE TABLE IF NOT EXISTS parks (
  id serial PRIMARY KEY,
  city_id varchar(50) NOT NULL REFERENCES cities(id),
  osm_id text NOT NULL,
  name text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  area_m2 double precision NOT NULL
);
-- indexes: GIST ((geom::geography)), btree (city_id)

CREATE TABLE IF NOT EXISTS reach_cells (
  city_id varchar(50) NOT NULL REFERENCES cities(id),
  h3 text NOT NULL,
  residents integer NOT NULL,
  outline geometry(Polygon, 4326) NOT NULL,
  centre geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (city_id, h3)
);

CREATE TABLE IF NOT EXISTS reach_nearest (
  city_id varchar(50) NOT NULL,
  h3 text NOT NULL,
  need text NOT NULL,
  place_kind text NOT NULL CHECK (place_kind IN ('poi', 'park')),
  place_id integer NOT NULL,
  metres integer NOT NULL,
  method text NOT NULL DEFAULT 'estimate',
  PRIMARY KEY (city_id, h3, need),
  FOREIGN KEY (city_id, h3) REFERENCES reach_cells (city_id, h3) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reach_calibration (
  city_id varchar(50) PRIMARY KEY REFERENCES cities(id),
  method text NOT NULL,
  metres_per_minute real NOT NULL,
  k_low real NOT NULL,
  k_high real NOT NULL,
  agreement jsonb NOT NULL,          -- {"5":0.91,"10":…}
  passing_stops integer[] NOT NULL,
  sample_size integer NOT NULL,
  checks jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reach_payloads (
  city_id varchar(50) PRIMARY KEY REFERENCES cities(id),
  body bytea NOT NULL,
  etag text NOT NULL,
  built_at timestamptz NOT NULL
);
```

`place_id` deliberately has no foreign key: place ids change on every reload. That's the rebuild rule.

- [ ] **Step 1: Write the file**, with a header comment in the style of migration 003: what it adds, why, and that it is safe to rerun.
- [ ] **Step 2: Apply to the branch:** `DOTENV_CONFIG_PATH=.env.reach-dev npm run migrate -- 004-everyday-reach.sql`. Expected: `Writing to reach-dev …`, then `Migration applied.`
- [ ] **Step 3: Apply it a second time.** Expected: success with no change, which proves it is safe to rerun.
- [ ] **Step 4: Read-only check on the branch.** Expected:
  - `idx_pois_geog` exists;
  - the five tables exist with the columns above;
  - `EXPLAIN SELECT id FROM pois ORDER BY geom::geography <-> ST_MakePoint(13.41,52.52)::geography LIMIT 1` shows an index scan on `idx_pois_geog`.
- [ ] **Step 5: Commit**
  ```bash
  git add cityscope-backend/src/scripts/migrations/004-everyday-reach.sql
  git commit -m "feat(db): migration 004, a distance index and the everyday reach tables"
  ```

### Task 7: Parks as shapes

**Files:**
- Create: `cityscope-backend/src/lib/parks.ts`, `cityscope-backend/src/lib/parks.test.ts`
- Create: `cityscope-backend/src/scripts/fetch-parks.ts`, `cityscope-backend/src/scripts/seed-parks.ts`
- Modify: `cityscope-backend/package.json`
  - add dev dependency `osmtogeojson@3.0.0-beta.5`;
  - add scripts `"fetch:parks": "tsx src/scripts/fetch-parks.ts"` and `"seed:parks": "tsx src/scripts/seed-parks.ts"`.

**Interfaces:**
- Produces:
  - `parksFromOverpass(osm: unknown): ParkFeature[]`, where `ParkFeature = { osmId: string; name: string | null; geometry: PolygonGeometry | MultiPolygonGeometry }` (the types are from `geometry.ts`);
  - `buildParkQuery(bbox: string): string`, which returns `[out:json][timeout:180];\nnwr["leisure"="park"](<bbox>);\nout geom;`.
- **File locations:**
  - `fetch-parks.ts <city>` writes `data/parks-<city>.json`, a FeatureCollection, using `fetchBounds` and `overpassFetch`.
  - `seed-parks.ts <city>` replaces the city's rows in one transaction. It inserts `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($g),4326),'method=structure'),3))` with `area_m2 = ST_Area(geom::geography)`, skips anything empty, and calls `announceTarget()` first.

- [ ] **Step 1: Write the failing tests.** Use a hand-built Overpass `out geom` fixture with:
  - a closed park way of 5 points;
  - a park multipolygon relation whose outer ring is split across two member ways;
  - an unclosed park way;
  - a `leisure=garden` way.

  Expected:
  - `keeps closed park ways as polygons`;
  - `assembles a multipolygon relation from its member ways` (one MultiPolygon or Polygon with one closed outer ring);
  - `drops unclosed ways and non-parks`;
  - `uses "way/<id>" and "relation/<id>" as osmId`;
  - `buildParkQuery` contains `nwr["leisure"="park"](52.32,13.058,52.693,13.791)` and `out geom`.
- [ ] **Step 2: Run** `npx vitest run src/lib/parks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `osmtogeojson`. Keep features whose `properties.leisure === 'park'` and whose geometry is Polygon or MultiPolygon. If `osmtogeojson` can't assemble relations from `out geom` input, which the relation test shows, switch the query to `out body; >; out skel qt;` and note it in the report.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 5: Real check on the branch.**
  1. Run `npm run fetch:parks -- berlin`, then `DOTENV_CONFIG_PATH=.env.reach-dev npm run seed:parks -- berlin`.
  2. Read-only checks. Expected:
     - Berlin parks ≥ 2,000, with ≥ 500 of at least 5,000 m²;
     - the row named `Großer Tiergarten` (or `Tiergarten`) has `area_m2` between 1.5e6 and 2.5e6;
     - no empty geometries.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/lib/parks.ts cityscope-backend/src/lib/parks.test.ts cityscope-backend/src/scripts/fetch-parks.ts cityscope-backend/src/scripts/seed-parks.ts cityscope-backend/package.json cityscope-backend/package-lock.json
  git commit -m "feat(data): parks as shapes, so reach is measured to a park's edge"
  ```

### Task 8: Population into cells

**Files:**
- Create: `cityscope-backend/src/lib/population.ts`, `cityscope-backend/src/lib/population.test.ts`
- Create: `cityscope-backend/src/lib/ghsl.ts` (file I/O only; no unit test)
- Modify: `cityscope-backend/package.json` (dev dependencies `h3-js@4.5.0`, `geotiff@3.0.5`)

**Interfaces:**
```ts
export const H3_RESOLUTION = 9;
export interface Box { south: number; west: number; north: number; east: number }
export interface RasterGrid { originLng: number; originLat: number; resLng: number; resLat: number; width: number; height: number } // resLat < 0
export interface PixelWindow { x0: number; y0: number; x1: number; y1: number } // x1, y1 exclusive
export function tilesForBox(box: Box): string[];            // GHSL 4326_3ss tile ids, 10° tiles: row = floor((90 − lat) / 10) + 1, col = floor((lng + 180) / 10) + 1
export function windowForBox(grid: RasterGrid, box: Box): PixelWindow | null; // clamped to the grid; null if no overlap
export function pixelCentre(grid: RasterGrid, x: number, y: number): { lng: number; lat: number };
export function cellsForOutline(outline: PolygonGeometry | MultiPolygonGeometry, resolution?: number): Set<string>;
export function addPixelsToCells(target: Map<string, number>, values: ArrayLike<number>, grid: RasterGrid, win: PixelWindow, allowed: ReadonlySet<string>, resolution?: number): void;
export function keptCells(residents: ReadonlyMap<string, number>): Map<string, number>; // rounds; keeps ≥ 1
```

- `values` is the window's raster in row-major order, so pixel `(x, y)` is at `values[(y − y0) · (x1 − x0) + (x − x0)]`.
- A cell's residents are the pixels whose **centre's H3 cell** is in `allowed`, which is the cells whose centres lie inside the outline.

  **Refinement of the spec's "pixels inside the outline":** the outline is the same set of cells, and the alternative is half a million point-in-polygon tests. Record it in the amendments.

`ghsl.ts`: `readGhslWindow(dir: string, tile: string, box: Box): Promise<{ grid: RasterGrid; win: PixelWindow; values: ArrayLike<number> } | null>`.
- Opens the `.tif` in `dir` whose name ends in `_<tile>.tif`, using `geotiff`'s `fromFile`.
- Builds the grid from `getOrigin()`, `getResolution()`, `getWidth()` and `getHeight()`.
- Reads only `windowForBox`.
- Throws `Error('GHSL tile <tile> not found in <dir>')` if the file is missing.

- [ ] **Step 1: Write the failing tests.**
  - **`tilesForBox`** on each city's outline box (from Task 5's measurement): london `['R4_C18','R4_C19']`, amsterdam `['R4_C19']`, berlin `['R4_C20']`, paris `['R5_C19']`, munich `['R5_C20']`, new-york `['R5_C11']`, tokyo `['R6_C32']`, sydney `['R13_C34']`. All 8 tiles exist on the JRC server; the sizes were checked on 2026-10-17.
  - **`pixelCentre`:** with grid origin (0, 10) and resolution (0.5, −0.5), pixel (0, 0) is `{lng: 0.25, lat: 9.75}`.
  - **`windowForBox`:** clamps to the grid, returns `null` for a box east of the grid, and returns `{x0:0,y0:0,x1:2,y1:2}` for a box that exactly covers a 2×2 grid.
  - **`addPixelsToCells`** with a tiny grid centred on Alexanderplatz (52.52, 13.405) and 3-arcsecond pixels:
    - `adds pixels into the cell of their centre`;
    - `ignores no-data and negative pixels` (values `[-200, NaN, 5, 0]` sum to 5);
    - `skips cells not allowed`;
    - `two adjacent tiles add into one map without double counting`: two 1×2 grids side by side, each value 1, end with a total of exactly 4.
  - **`keptCells`:** `0.4` is dropped, `0.6` becomes `1`, `12.5` becomes `13`.
  - **`cellsForOutline`** on a small square around Alexanderplatz contains `891f1d48947ffff`.
- [ ] **Step 2: Run** `npx vitest run src/lib/population.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `population.ts` (using h3-js `polygonToCells(…, 9, true)` and `latLngToCell`) and `ghsl.ts`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add cityscope-backend/src/lib/population.ts cityscope-backend/src/lib/population.test.ts cityscope-backend/src/lib/ghsl.ts cityscope-backend/package.json cityscope-backend/package-lock.json
  git commit -m "feat(data): add up GHSL residents into H3 cells"
  ```

### Task 9: Build cells and nearest places

**Controller, before dispatch:** ask the owner to approve downloading **`GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_R4_C20.zip` (151 MB, JRC)**. Then download it into `cityscope-backend/data/ghsl/` and unzip it there. In PowerShell: `Expand-Archive -Path <zip> -DestinationPath cityscope-backend/data/ghsl -Force`.

**Files:**
- Create: `cityscope-backend/src/scripts/build-reach.ts`
- Modify: `cityscope-backend/package.json` (script `"reach:build": "tsx src/scripts/build-reach.ts"`)

**Interfaces:**
- **Consumes:** `CityConfig.reach`, `NEEDS`, `PARK_MIN_AREA_M2`, `NONE_FOUND_METRES`, `tilesForBox`, `readGhslWindow`, `cellsForOutline`, `addPixelsToCells`, `keptCells`, `announceTarget`.
- **Usage:** `reach:build -- <city> [--ghsl <dir>] [--dry-run]`. The default `dir` is `data/ghsl`.
- **What it does:**
  1. **Outline:** `SELECT ST_AsGeoJSON(ST_Union(geom)) FROM districts WHERE city_id = $1 AND ($2::text IS NULL OR name LIKE '%' || $2)`.
  2. **Residents:** `allowed = cellsForOutline(outline)`. For each `tilesForBox(outline bbox)`, read the window and `addPixelsToCells`. Then apply `keptCells`.
  3. **Print:** cells in the outline, kept cells, and total residents. `--dry-run` stops here and writes nothing.
  4. **Write**, in one transaction:
     - `DELETE FROM reach_payloads`, `reach_calibration` and `reach_cells` for the city. Cascades clear `reach_nearest`, and a rebuild invalidates the calibration.
     - Insert cells in batches of 500, with `outline` from `cellToBoundary(h, true)` and `centre` from `cellToLatLng`.
     - Then, per need, one set-based statement:

     ```sql
     INSERT INTO reach_nearest (city_id, h3, need, place_kind, place_id, metres, method)
     SELECT c.city_id, c.h3, $2, 'poi', n.id, LEAST(round(n.d), 65534)::int, 'estimate'
     FROM reach_cells c
     CROSS JOIN LATERAL (
       SELECT p.id, ST_Distance(p.geom::geography, c.centre::geography) AS d
       FROM pois p
       WHERE p.city_id = c.city_id AND p.category = ANY($3::text[])
       ORDER BY p.geom::geography <-> c.centre::geography
       LIMIT 1
     ) n
     WHERE c.city_id = $1;
     ```

     The park variant reads `parks k` with `k.area_m2 >= $3` and `place_kind 'park'`. Cells with no row for a need are read later as `NONE_FOUND_METRES`.
  5. **Print** each need's row count and timing.

- [ ] **Step 1: Run** `npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 2: Dry run on the branch:** `DOTENV_CONFIG_PATH=.env.reach-dev npm run reach:build -- berlin --dry-run`. Expected:
  - cells in the outline about 9,462, which is the Section 2 probe's count;
  - kept cells fewer than that;
  - total residents between 3.4 M and 4.1 M (Berlin is about 3.9 M).

  Stop and report if it's outside that range.
- [ ] **Step 3: Real run:** `DOTENV_CONFIG_PATH=.env.reach-dev npm run reach:build -- berlin`. Expected:
  - every kept cell has 6 `reach_nearest` rows, or fewer only where a need has no place at all, which is reported;
  - the whole build takes under 10 minutes.
- [ ] **Step 4: Read-only spot check.**
  - The cell `891f1d48947ffff` (Alexanderplatz) has `sm` under 600 m and `st` under 300 m.
  - Median metres per need are printed.
- [ ] **Step 5: Commit**
  ```bash
  git add cityscope-backend/src/scripts/build-reach.ts cityscope-backend/package.json
  git commit -m "feat(data): build reach cells and each need's nearest place in PostGIS"
  ```

### Task 10: Calibration

**Files:**
- Create: `cityscope-backend/src/lib/sampling.ts`, `src/lib/sampling.test.ts`, `src/lib/calibration.ts`, `src/lib/calibration.test.ts`
- Create: `cityscope-backend/src/scripts/calibrate-reach.ts`
- Modify: `package.json` (script `"reach:calibrate": "tsx src/scripts/calibrate-reach.ts"`)

**Interfaces:**
```ts
// sampling.ts
export function mulberry32(seed: number): () => number;   // [0, 1)
export function weightedSample(items: readonly { id: string; weight: number }[], n: number, seed: number): string[];
// Efraimidis–Spirakis: key = r ** (1 / weight); the n largest keys, in descending key order; weight ≤ 0 is never chosen.

// calibration.ts
export type Band = 5 | 10 | 15 | 20;
export const BANDS: readonly Band[];                 // [5, 10, 15, 20]
export const AGREEMENT_BAR = 0.8;
export const CALIBRATION_SAMPLE = 60;
export const BOOTSTRAP_ROUNDS = 200;
export const CALIBRATION_SEED = 20261017;
export interface Observation { cell: string; need: string; band: Band; metres: number; inside: boolean }
export function kCandidates(): number[];             // 30, 30.5, …, 150
export function agreement(obs: readonly Observation[], k: number): number;  // predicted inside ⇔ metres / k ≤ band
export function fitK(obs: readonly Observation[]): number;
export function agreementByBand(obs: readonly Observation[], k: number): Record<Band, number>;
export function bootstrapK(obs: readonly Observation[], rounds: number, seed: number): { kLow: number; kHigh: number };
export function passingStops(byBand: Record<Band, number>, bar?: number): Band[];
export function cityPasses(stops: readonly Band[]): boolean;   // includes 15
```

**Choices the tests pin:**
- **`fitK` ties:** among candidates with the best agreement, take `ties[Math.floor((ties.length - 1) / 2)]`.
- **`bootstrapK`:**
  - the cells are the unique `cell` values, in the order they first appear;
  - each round draws that many cells with replacement from one `mulberry32(seed)` stream and runs `fitK` on their observations;
  - sort ascending; `kLow = ks[Math.floor(0.05 * (rounds - 1))]` and `kHigh = ks[Math.ceil(0.95 * (rounds - 1))]`.

- [ ] **Step 1: Write the failing tests.**
  - **Sampling:**
    - the same seed gives the same sample;
    - asking for more than exists returns every positive-weight item;
    - weight 0 is never chosen;
    - with weights 1 versus 99 and `n = 1`, over seeds 1–1000, the heavy item is chosen at least 900 times;
    - `mulberry32` stays within [0, 1).
  - **Calibration:** build a perfect set where each band T has `metres = 68·T` with `inside: true` and `metres = 72·T` with `inside: false`, for all four bands and two cells. Then:
    - `fitK` gives **69.5** (any k in [68, 72) is perfect, and the middle candidate is 69.5);
    - `agreementByBand(obs, 69.5)` is all 1;
    - `agreementByBand(obs, 60)` is all 0.5;
    - `bootstrapK(obs, 200, 20261017)` gives `{kLow: 69.5, kHigh: 69.5}`, and the same again on a second call;
    - `a none-found distance is predicted outside`: `{metres: 65535, band: 20, inside: false}` counts as agreement for every candidate;
    - `passingStops({5:0.79,10:0.8,15:0.92,20:0.85})` is `[10,15,20]`;
    - `cityPasses([10,20])` is false.
- [ ] **Step 2: Run** `npx vitest run src/lib/sampling.test.ts src/lib/calibration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement both libraries.** Then write `calibrate-reach.ts <city>`:
  1. Read cells (`h3`, `residents`, centre `lng`/`lat`), then `weightedSample(cells, 60, CALIBRATION_SEED)`.
  2. For each sampled cell, fetch `https://api.mapbox.com/isochrone/v1/mapbox/walking/{lng},{lat}?contours_minutes=5,10,15,20&polygons=true&generalize=0&access_token=${MAPBOX_TOKEN}`, with 250 ms between requests.
  3. One SQL statement per cell joins its `reach_nearest` rows to the four band polygons (from `jsonb_array_elements`). `inside = ST_Intersects(band, place geom)`, where the place geom is the POI point or the park shape.
  4. Fit on the first 30 cells' observations. Report `agreementByBand` on the last 30, and run `bootstrapK` on all 60.
  5. Upsert `reach_calibration` with `method 'estimate'`, `agreement` as `{"5":…}`, `passing_stops` and `sample_size 60`, and delete the city's `reach_payloads` row.
  6. Print `k`, `kLow`–`kHigh`, the per-band table, pass or fail, and the 10 held-out cells with the most misclassifications (h3, centre, which needs and bands).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 5: Real run on the branch:** `DOTENV_CONFIG_PATH=.env.reach-dev npm run reach:calibrate -- berlin`. Expected:
  - 60 Mapbox calls with no 4xx;
  - `k` between 45 and 110 m/min;
  - `kLow ≤ k ≤ kHigh`;
  - the table is printed.

  Whatever the agreement, report it; don't tune anything to pass the bar.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/lib/sampling.ts cityscope-backend/src/lib/sampling.test.ts cityscope-backend/src/lib/calibration.ts cityscope-backend/src/lib/calibration.test.ts cityscope-backend/src/scripts/calibrate-reach.ts cityscope-backend/package.json
  git commit -m "feat(data): calibrate the walking estimate against Mapbox on a held-out half"
  ```

### Task 11: Payload and publish

**Files:**
- Create: `cityscope-backend/src/lib/reachPayload.ts`, `src/lib/reachPayload.test.ts`
- Create: `cityscope-backend/src/scripts/publish-reach.ts`
- Modify: `package.json` (script `"reach:publish": "tsx src/scripts/publish-reach.ts"`)

**Interfaces:**
```ts
export const POPULATION_SOURCE = 'GHSL GHS-POP R2023A, 2025 epoch (European Commission, JRC), CC BY 4.0';
export const PLACES_SOURCE = '© OpenStreetMap contributors, ODbL';
export interface CellRow { h3: string; residents: number; ring: [number, number][] } // closed lng/lat ring
export interface NearestRow { h3: string; need: NeedId; metres: number }
export interface CalibrationRow { metresPerMinute: number; kLow: number; kHigh: number; agreement: Record<Band, number>; stops: Band[]; sampleSize: number; checks: Record<string, unknown> }
export interface ReachInfo { city: string; cityName: string; coverage: string; builtAt: string; perHundredThousand: Record<NeedId, number> }
export interface ReachMeta { city: string; cityName: string; coverage: string; residents: number; method: 'estimate'; metresPerMinute: number; kLow: number; kHigh: number; agreement: Record<Band, number>; stops: Band[]; passes: boolean; sampleSize: number; needs: { id: NeedId; label: string }[]; builtAt: string; sources: { places: string; population: string }; completeness: { perHundredThousand: Record<NeedId, number>; checks: Record<string, unknown> } }
export interface ReachPayload { type: 'FeatureCollection'; meta: ReachMeta; features: GeoJSON-style Feature[] /* Polygon, properties { h, r, sm, ph, dr, sc, pk, st } */ }
export function buildReachPayload(cells: readonly CellRow[], nearest: readonly NearestRow[], cal: CalibrationRow, info: ReachInfo): ReachPayload;
export function encodePayload(payload: ReachPayload): { body: Buffer; etag: string };  // Brotli q11; etag = `"${sha1(body).slice(0,16)}"`
```

- [ ] **Step 1: Write the failing tests.**
  - `rounds coordinates to 5 decimals`: 13.4051234 becomes 13.40512.
  - `writes flat integer properties`: each feature's properties are exactly `h r sm ph dr sc pk st`, all numbers except `h`.
  - `writes NONE_FOUND for a need with no nearest row`: 65535.
  - `meta.residents is the sum of r`.
  - `meta.passes is false when 15 is not a stop`.
  - `meta.needs follows NEEDS order with labels`.
  - `encodePayload round-trips`: `JSON.parse(brotliDecompressSync(body))` deep-equals the payload.
  - `etag is strong and stable`: it matches `/^"[0-9a-f]{16}"$/`, is the same for the same payload, and differs after one change.
- [ ] **Step 2: Run** `npx vitest run src/lib/reachPayload.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then write `publish-reach.ts <city>`.
  1. Refuse with `Run reach:calibrate -- <city> first` if there's no calibration.
  2. Load the cells (`ST_AsGeoJSON(outline)`), the nearest rows and the calibration.
  3. Compute `perHundredThousand` in SQL: per need, the count of that need's places inside the outline divided by total residents, × 1e5, to one decimal. Parks count if `area_m2 ≥ 5000` and they intersect the outline.
  4. Build, encode and upsert `reach_payloads`, with `built_at = now()`.
  5. Print raw bytes, compressed bytes and the etag.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 5: Real run on the branch:** `DOTENV_CONFIG_PATH=.env.reach-dev npm run reach:publish -- berlin`. Expected: a compressed size under 320 KB, which is the probe's figure with every cell, and the etag printed.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/lib/reachPayload.ts cityscope-backend/src/lib/reachPayload.test.ts cityscope-backend/src/scripts/publish-reach.ts cityscope-backend/package.json
  git commit -m "feat(data): publish each city's reach as one compressed payload"
  ```

### Task 12: The reach API

**Files:**
- Create: `cityscope-backend/src/lib/reachHttp.ts`, `src/lib/reachHttp.test.ts`
- Create: `cityscope-backend/src/routes/reach.ts`
- Modify: `cityscope-backend/src/index.ts` (`app.use('/api/cities/:cityId/reach', reachRouter);` after the other city-scoped routes)
- Modify: `cityscope-backend/src/lib/reachPayload.ts` (add `shapeCellCard`)

**Interfaces:**
```ts
// reachHttp.ts
export const REACH_CACHE_CONTROL = 'public, max-age=86400';
export function acceptsBrotli(acceptEncoding: string | undefined): boolean;  // a "br" token, case-insensitive, with q ≠ 0
export function isFresh(ifNoneMatch: string | undefined, etag: string): boolean; // '*' or any listed tag equal once a leading W/ is stripped
export function isH3CellId(value: string): boolean;  // /^89[0-9a-f]{13}$/  (resolution 9, lower case)
// reachPayload.ts
export interface CardRow { need: NeedId; metres: number; name: string | null; category: string; lng: number; lat: number }
export interface CellCard { cell: string; residents: number; metresPerMinute: number; needs: { need: NeedId; name: string | null; category: string | null; lng: number | null; lat: number | null; metres: number | null; minutes: number | null }[] }
export function shapeCellCard(cell: string, residents: number, rows: readonly CardRow[], metresPerMinute: number): CellCard; // NEEDS order; minutes = Math.round(metres / k); missing need → all null
```

**Routes:**
- **`GET /`:**
  1. `SELECT etag FROM reach_payloads WHERE city_id = $1`. If there's none, return `404 {"error":"No reach data for this city"}`.
  2. If `isFresh`, return `304`, with the `ETag` and `Cache-Control` headers, without reading the body.
  3. Otherwise read the body and set `ETag`, `Cache-Control: REACH_CACHE_CONTROL`, `Vary: Accept-Encoding` and `Content-Type: application/json`.
  4. With `acceptsBrotli`, set `Content-Encoding: br` and send the bytes; otherwise send `brotliDecompressSync(body)`.
- **`GET /:cellId`:**
  1. If `!isH3CellId`, return `400 {"error":"Invalid cell id"}`.
  2. Run one query joining `reach_cells`, `reach_nearest`, `pois` and `parks`. For parks, `lng`/`lat` is `ST_ClosestPoint(park, cell centre)`. Also read `reach_calibration`'s k.
  3. If there's no row, return `404 {"error":"No such cell in this city"}`.
  4. Otherwise return `200 shapeCellCard(…)` with `Cache-Control: REACH_CACHE_CONTROL`.

- [ ] **Step 1: Write the failing tests.**
  - **`acceptsBrotli`:**
    - true for `'gzip, deflate, br'`, `'BR'` and `'br;q=0.5'`;
    - false for `'br;q=0'`, `'gzip'` and `undefined`.
  - **`isFresh`:**
    - `('"abc"','"abc"')` and `('W/"abc"','"abc"')` are true;
    - `('"x", "abc"','"abc"')` and `('*','"abc"')` are true;
    - `(undefined,'"abc"')` and `('"abd"','"abc"')` are false.
  - **`isH3CellId`:**
    - true for `'891f1d48947ffff'`;
    - false for `'881f1d4895fffff'` (resolution 8), `'891F1D48947FFFF'`, `'891f1d48947fff'`, `'891f1d48947ffffa'` and `'../etc/passwd'`.
  - **`shapeCellCard`:** needs come out in `NEEDS` order, `minutes = Math.round(612 / 68)` is `9`, and a missing `st` gives a row with all-null values.
- [ ] **Step 2: Run** `npx vitest run src/lib/reachHttp.test.ts src/lib/reachPayload.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, `shapeCellCard` and the router.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run typecheck:scripts`. Expected: PASS.
- [ ] **Step 5: Live check against the branch.** Use a one-off process: `PORT=3098 DOTENV_CONFIG_PATH=.env.reach-dev node --import tsx <scratch script>`. The scratch script imports `src/index.ts`, makes the requests below, then calls `process.exit(0)`. Expected:

  | Request | Result |
  |---|---|
  | `GET /api/cities/berlin/reach` with `Accept-Encoding: br` | 200, `content-encoding: br`, a strong etag, the cache-control header |
  | the same with `If-None-Match: <etag>` | 304 with an empty body |
  | without `Accept-Encoding` | 200 parseable JSON, with `meta.city` = `berlin` and no `content-encoding` |
  | `GET /api/cities/atlantis/reach` | 404 |
  | `GET /api/cities/berlin/reach/891f1d48947ffff` | 200 with 6 needs |
  | `…/reach/891F1D48947FFFF` | 400 |
  | `…/reach/89be0e35cbbffff` (a Sydney cell, asked for under Berlin) | 404 |

  Port 3098 must be free again afterwards.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/lib/reachHttp.ts cityscope-backend/src/lib/reachHttp.test.ts cityscope-backend/src/lib/reachPayload.ts cityscope-backend/src/lib/reachPayload.test.ts cityscope-backend/src/routes/reach.ts cityscope-backend/src/index.ts
  git commit -m "feat(api): serve each city's reach payload and a block's nearest places"
  ```

### Task 13: Full run on the branch, all eight cities

**Controller, before dispatch:** ask the owner to approve the remaining seven GHSL tiles from the JRC server, about 894 MB in total:

| Tile | Size | Covers |
|---|---|---|
| `R4_C18` | 110 MB | London west |
| `R4_C19` | 144 MB | London east, Amsterdam |
| `R5_C19` | 178 MB | Paris |
| `R5_C20` | 173 MB | Munich |
| `R5_C11` | 190 MB | New York |
| `R6_C32` | 86 MB | Tokyo |
| `R13_C34` | 13 MB | Sydney |

Download and unzip each as in Task 9.

**Files:** Modify `cityscope-backend/src/scripts/pois-data-*.json` (all 8, refetched). Create nothing else.

- [ ] **Step 1: For each city in turn**, with ≥ 30 s between Overpass calls: `fetch:pois`, `fetch:parks`, then on the branch `seed:pois`, `seed:parks`, `reach:build`, `reach:calibrate`, `reach:publish`. If an Overpass call fails after its retries, stop and report; don't skip a city.
- [ ] **Step 2: Record a results table** in the report.
  - Per city:
    - category counts before (production, read-only) and after (branch);
    - kept cells and total residents;
    - `k`, `kLow`–`kHigh`, and agreement for each band;
    - the passing stops, and whether the city passes;
    - the compressed payload in KB (London must be ≤ 450 KB; report it if not);
    - the 3 worst-missed cells.
  - Also: places per 100,000 residents per need.
- [ ] **Step 3: Live checks against the branch**, using the Task 12 process pattern.
  - **Both endpoints for all eight cities.** `GET /api/cities/<city>/reach` is 200, with `meta.city` matching and the coverage label from Global Constraints. `GET …/reach/<one of its cells>` is 200 with 6 needs.

  **The lists exclude the new measurement-only categories.**
  - `GET /api/cities/berlin/pois` has no `tram_stop` or `subway_entrance`.
  - The statistics for every Berlin district list neither.
  - `POST /api/cities/berlin/pois/within` with a 1 km square around Alexanderplatz lists neither.
- [ ] **Step 4: Commit the refetched place files**, all eight by explicit path:
  ```bash
  git add cityscope-backend/src/scripts/pois-data-amsterdam.json cityscope-backend/src/scripts/pois-data-berlin.json cityscope-backend/src/scripts/pois-data-london.json cityscope-backend/src/scripts/pois-data-munich.json cityscope-backend/src/scripts/pois-data-new-york.json cityscope-backend/src/scripts/pois-data-paris.json cityscope-backend/src/scripts/pois-data-sydney.json cityscope-backend/src/scripts/pois-data-tokyo.json
  git commit -m "data: refetch places with the six everyday needs and a 2 km margin"
  ```

### Task 14: London GP coverage check

**Controller, before dispatch:** ask the owner to approve downloading NHS England's GP practice list. That's the `epraccur` CSV from the ODS Data Search and Export service; the controller states its URL and size when asking. Save it to `cityscope-backend/data/nhs/epraccur.csv`.

**Files:**
- Create: `cityscope-backend/src/lib/gpCoverage.ts`, `src/lib/gpCoverage.test.ts`
- Create: `cityscope-backend/src/scripts/check-gp-coverage.ts`
- Modify: `package.json` (script `"reach:check-gp": "tsx src/scripts/check-gp-coverage.ts"`)

**Interfaces:**
- `parseGpPractices(csv: string): { code: string; postcode: string }[]`. Keeps active practices: status column `'A'` and prescribing-setting column `'4'`.
  - **Expected layout:** headerless; code is column 0, postcode column 9, status column 12, prescribing setting column 25.
  - **Verify against the downloaded file's specification first.** If the indexes differ, use the real ones and say so in the report.
- `shareWithin(distances: readonly number[], metres: number): number`, from 0 to 1. An empty list gives 0.

- [ ] **Step 1: Write the failing tests.** With a 3-row fixture (one active GP, one closed, one with a non-GP setting), `parseGpPractices` returns only the active GP with its code and postcode. `shareWithin([100, 149, 151, 400], 150)` is `0.5`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.**
- [ ] **Step 4: Write the script.**
  1. Parse the file.
  2. Look up postcodes with `POST https://api.postcodes.io/postcodes`, 100 per request.
  3. Keep the practices that fall inside London's outline (`ST_Within`).
  4. For each, find the nearest `doctors` or `clinic` POI distance with a KNN query on the geography index.
  5. Compute `share = shareWithin(d, 150)`.
  6. Update `reach_calibration.checks` for London to `checks || {"londonGpShare": share, "londonGpPractices": n}`.
  7. Print the result, plus a reminder to rerun `reach:publish -- london`.
- [ ] **Step 5: Run it on the branch, then `reach:publish -- london`.** Report the share and the practice count.
- [ ] **Step 6: Commit**
  ```bash
  git add cityscope-backend/src/lib/gpCoverage.ts cityscope-backend/src/lib/gpCoverage.test.ts cityscope-backend/src/scripts/check-gp-coverage.ts cityscope-backend/package.json
  git commit -m "feat(data): check London's doctor data against the NHS practice list"
  ```

### Task 15: Documentation

**Files:** Modify `README.md`, `CLAUDE.md` and `docs/superpowers/specs/2026-10-17-everyday-reach-design.md`.

- [ ] **Step 1: README.**
  - **API table:** add rows for `GET /api/cities/:cityId/reach` and `GET /api/cities/:cityId/reach/:cellId`.
  - **"Data & honesty note":**
    - 19 categories, of which tram stops and metro entrances only measure the station need;
    - the fetch box is the outline plus 2 km;
    - parks are stored as shapes, and the park need counts only those of at least 0.5 ha;
    - credit GHSL with its citation: Schiavina, Freire, Carioli, MacManus (2023), *GHS-POP R2023A*, European Commission JRC, doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE, CC BY 4.0.
  - **Getting started:**
    - `CITYSCOPE_DB_TARGET` (set it to `local` for a local database);
    - the reach pipeline order: `fetch:pois`, `fetch:parks`, `seed:pois`, `seed:parks`, `reach:build`, `reach:calibrate`, `reach:publish`;
    - **the rule that cells are rebuilt after every place reload.**
- [ ] **Step 2: `CLAUDE.md`.**
  - New commands, and migrations 003 and 004.
  - The `CITYSCOPE_DB_TARGET` and Neon-branch workflow (`DOTENV_CONFIG_PATH=.env.reach-dev`).
  - The rebuild rule.
  - Overpass needs the `User-Agent` header.
- [ ] **Step 3: Spec.** Add a section "Amendments while building Phase 1" covering:
  - `healthcare=doctor` stored as `doctors`;
  - fetch boxes are the union of the old bounds and the outline plus 2 km (Sydney's wider heatmap is kept);
  - population cells use the H3 cell-centre rule;
  - the `NONE_FOUND_METRES` sentinel;
  - the `CITYSCOPE_DB_TARGET` guard;
  - any `osmtogeojson` query change;
  - the measured results table from Task 13.
- [ ] **Step 4: Commit**
  ```bash
  git add README.md CLAUDE.md docs/superpowers/specs/2026-10-17-everyday-reach-design.md
  git commit -m "docs: everyday reach data pipeline, sources and Phase 1 results"
  ```

---

## After merge: production runbook (controller, each step with the owner's go-ahead)

1. **Confirm the deploy.** `curl https://cityscope-rzj5.onrender.com/api/cities/berlin/reach` returns 404 `No reach data for this city`, which shows the code is live.
2. **Migration:** `CITYSCOPE_DB_TARGET=production npm run migrate -- 004-everyday-reach.sql`.
3. **Per city, using the committed place files and freshly fetched parks:** `CITYSCOPE_DB_TARGET=production npm run seed:pois -- <city>`, then `seed:parks`, `reach:build`, `reach:calibrate` (the owner adds `MAPBOX_TOKEN` to the production `.env` first) and `reach:publish`. Then `reach:check-gp -- london` and republish London.
4. **Verify live:**
   - both endpoints for all 8 cities;
   - the lists exclude tram stops and metro entrances;
   - Render and Cloudflare pass `Content-Encoding: br` through untouched;
   - the payload sizes.
5. **Optional:** the owner deletes the `reach-dev` Neon branch.
