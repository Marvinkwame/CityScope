# Everyday Reach by Street Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Everyday reach's straight-line walking estimate with walks measured along each city's OpenStreetMap street network, and draw each walk on the block card's map.

**Architecture:** A new `fetch:streets` script saves each city's walkable network to a git-ignored file. `reach:build --method network` (the new default) loads it into an in-memory graph, joins blocks, places and park edges to it, runs one multi-source Dijkstra per need, and writes metres, the nearest place and a simplified walk line per block and need into `reach_nearest`. Calibration, publishing, the payload and the map are unchanged apart from `meta.method`, two source dates, a `walk` on each card row, wording that follows the method, and a stale card that refetches itself once.

**Tech Stack:** Node + TypeScript (NodeNext ESM, `tsx`), PostgreSQL + PostGIS (`pg`), Overpass, Vitest; React 19, TanStack Query 5, Mapbox GL JS 3.

**Spec:** `docs/superpowers/specs/2026-11-21-street-network-walking-design.md`, which builds on `docs/superpowers/specs/2026-10-17-everyday-reach-design.md`. Read both.

## Global Constraints

- Walkable `highway` values: `footway`, `path`, `pedestrian`, `steps`, `living_street`, `residential`, `service`, `unclassified`, `road`, `track`, `cycleway`, `bridleway`, `corridor`, `tertiary`, `tertiary_link`, `secondary`, `secondary_link`, `primary`, `primary_link`, `trunk`, `trunk_link`.
- Left out: `motorway`, `motorway_link`; `foot=no`; `access=private` or `access=no` unless `foot` is `yes`, `designated` or `permissive`; `highway=construction` and `proposed`; ferries. One-way tags ignored. Ways connect only through shared OSM nodes.
- Only the largest connected part of each network is kept.
- Park entry points every 25 m along the outline, each joined to the nearest node within 30 m; a park with none joins through its single closest entry point. Parks count from `PARK_MIN_AREA_M2` (5,000 m², 0.5 ha).
- Metres: join distances plus network distance, rounded, capped at 65534. No place reachable: no row, which reads as `NONE_FOUND_METRES` (65535).
- Walk lines: from the block's centre to the place (a park's entry point), Douglas–Peucker at 2 m, coordinates to 5 decimals. The stored metres are the search's, never the simplified line's length.
- Blocks more than 150 m from the network are listed by the build.
- Deterministic: same inputs, same output. Ties go to the lower place rank (places ordered by id), then the lower node index.
- Distances on a sphere of radius 6,371,008.8 m (haversine). My call: the existing straight-line metres used the spheroid; the difference is under 0.5% and the calibration absorbs it.
- The street network is never stored in any database. Street files live in `cityscope-backend/data/` (git-ignored) and are never committed, nor are GHSL tiles, park files, NHS files, `data/reach-before/` or any `.env.*`.
- Size budget: Berlin is measured first; if the projected walk storage for all eight cities exceeds 120 MB, stop and bring it to the owner.
- Strict TypeScript, no `any`, `import type` for type-only imports, `.js` on relative backend imports. No colour literals outside `cityscope/src/theme.ts`.
- Every backend task ends with `npm test` and `npm run typecheck:scripts` passing in `cityscope-backend`; every frontend task with `npm test`, `npm run lint` and `npm run build` passing in `cityscope`.
- Commits: one concern each, staged by explicit path (never `git add -A`), **no `Co-Authored-By` trailer**.
- Never start, stop or restart the owner's servers (frontend :5173, backend :3001); ask the owner.
- Production writes only with the owner's go-ahead (`CITYSCOPE_DB_TARGET=production`, `DOTENV_CONFIG_PATH=.env.production-direct`). Read-only production checks run on one connection inside `BEGIN READ ONLY … ROLLBACK`, with `SHOW transaction_read_only` returning `on` inside that transaction first. Never print `.env` contents or tokens.
- On production, migration 005 is applied **before** the branch is merged, and the merged frontend is deployed before the first city is published by street.

## Review Focus

1. **A card cached by the browser before the deploy has no `walk` field.** `linkLines` must draw today's straight line for it, not crash or draw nothing. (Task 8)
2. **A block or place beside an island of paths** (a footpath network with no link to the streets) must join the main network, not the island. (Task 2)
3. **A way crossing a tile edge comes back from both tiles.** It must count once, and its shared nodes must keep the network connected across the edge. (Task 1)
4. **A block whose nearest node is the place's node** gives a two-point walk, centre to place, with metres equal to the two join distances. (Task 4)
5. **A second mismatch after a heal, or a failed heal**, must never send another request for the same payload version and block. (Task 9)

---

### Task 0 (controller): The local stand-in database

Development builds write to a throwaway local PostgreSQL, as Phase 1 did. `cityscope-backend/.env.local-pg` exists and names it (port 55432). Read the file for the database name without printing it.

- [ ] **Step 1: Start the Phase 1 cluster if its data directory still exists; otherwise create one** with `C:/Program Files/PostgreSQL/18/bin/initdb.exe` in `%LOCALAPPDATA%/cityscope-local-pg` and start it with `pg_ctl` on port 55432. Create the database `.env.local-pg` names, then `CREATE EXTENSION postgis`.
- [ ] **Step 2: Load the schema and data:** `src/scripts/setup-db.sql` if the cluster is new, then migrations 001–004 with `npm run migrate`, `npm run seed:all` and `npm run seed:parks -- <city>` for each of the eight cities. Prefix each with `DOTENV_CONFIG_PATH=.env.local-pg CITYSCOPE_DB_TARGET=local-pg`, and read the printed host: it must be `localhost:55432`.
- [ ] **Step 3: Check the counts** against the reach spec's "Places and parks" table: Berlin has 30,336 places and 3,093 park shapes, and Sydney has 14,598 and 3,446.
- [ ] **Step 4: Prove the stand-in reproduces Phase 1:** run today's `reach:build -- sydney`, `reach:calibrate -- sydney` and `reach:publish -- sydney`. Calibration must make no Mapbox requests, and the payload must match the reach spec's Sydney row: k 69.5 (59.5–73.5), all four stops.

---

### Task 1: Fetch each city's walkable street network

**Files:**
- Create: `cityscope-backend/src/lib/streets.ts`, `cityscope-backend/src/lib/streets.test.ts`, `cityscope-backend/src/scripts/fetch-streets.ts`
- Modify: `cityscope-backend/src/lib/sourceDates.ts` (add `streetsRecordName`), `cityscope-backend/package.json` (add `"fetch:streets": "tsx src/scripts/fetch-streets.ts"`)

**Interfaces:**
- Consumes: `overpassFetch(query)` (`lib/overpass.ts`); `osmBaseOf`, `writeFetchRecord` (`lib/sourceDates.ts`); `CITY_CONFIGS[].fetchBounds` (`config/cities.ts`).
- Produces:
  ```ts
  export const WALKABLE_HIGHWAYS: readonly string[];            // the Global Constraints list, in that order
  export function isWalkable(tags: Readonly<Record<string, string>>): boolean;
  export interface Bounds { south: number; west: number; north: number; east: number }
  export function tilesOf(bounds: Bounds, sizeDegrees: number): Bounds[];  // row by row from south-west; edge tiles clipped to bounds
  export function buildStreetQuery(tile: Bounds): string;        // [out:json][timeout:180]; way["highway"~"^(…)$"](s,w,n,e); out body geom;
  /** One city's network, compact: nodes sorted by OSM id, `coords` = [lng0, lat0, lng1, lat1, …] to 7 decimals; each way a list of node indexes, ways sorted by OSM way id. */
  export interface StreetsFile { version: 1; nodeCount: number; coords: number[]; ways: number[][] }
  export class StreetsCollector {
    addOverpassAnswer(body: unknown): { ways: number; kept: number };  // drops non-walkable ways and ways with < 2 nodes; dedupes by way id
    toFile(): StreetsFile;
  }
  export function parseStreetsFile(text: string): StreetsFile;   // throws on coords.length !== 2 * nodeCount or a node index out of range
  // sourceDates.ts
  export function streetsRecordName(cityId: string): string;     // `streets-${cityId}.source.json`
  ```

- [ ] **Step 1: Write the failing tests** in `streets.test.ts`:

```ts
it('isWalkable keeps streets and paths and drops what a walker cannot use', () => {
  expect(isWalkable({ highway: 'residential' })).toBe(true);
  expect(isWalkable({ highway: 'trunk' })).toBe(true);
  expect(isWalkable({ highway: 'motorway' })).toBe(false);
  expect(isWalkable({ highway: 'footway', foot: 'no' })).toBe(false);
  expect(isWalkable({ highway: 'service', access: 'private' })).toBe(false);
  expect(isWalkable({ highway: 'service', access: 'private', foot: 'yes' })).toBe(true);
  expect(isWalkable({ highway: 'track', access: 'no', foot: 'designated' })).toBe(true);
  expect(isWalkable({ highway: 'construction' })).toBe(false);
  expect(isWalkable({ route: 'ferry' })).toBe(false);
});

it('tilesOf covers the bounds and clips the last row', () => {
  const tiles = tilesOf({ south: 0, west: 0, north: 0.25, east: 0.1 }, 0.1);
  expect(tiles).toHaveLength(3);
  expect(tiles[2]).toEqual({ south: 0.2, west: 0, north: 0.25, east: 0.1 });
});

it('buildStreetQuery asks for the walkable ways in the tile with their nodes and geometry', () => {
  const q = buildStreetQuery({ south: 52.5, west: 13.3, north: 52.6, east: 13.4 });
  expect(q).toContain('(52.5,13.3,52.6,13.4)');
  expect(q).toContain('out body geom');
  for (const h of WALKABLE_HIGHWAYS) expect(q).toContain(h);
  expect(q).not.toContain('motorway');
});

it('a way returned by two tiles counts once and keeps its shared nodes', () => {
  const c = new StreetsCollector();
  c.addOverpassAnswer(answer([way(10, [1, 2, 3])]));
  c.addOverpassAnswer(answer([way(10, [1, 2, 3]), way(11, [3, 4])]));
  const f = c.toFile();
  expect(f.ways).toHaveLength(2);
  expect(f.nodeCount).toBe(4);
  expect(f.ways[0][2]).toBe(f.ways[1][0]); // node 3 shared
});
```

Plus: nodes are sorted by OSM id and coordinates rounded to 7 decimals; a non-walkable way and a one-node way are dropped; `parseStreetsFile(JSON.stringify(f))` round-trips, and it throws for a bad `coords` length and for a way index ≥ `nodeCount`. `answer` and `way` are local helpers that build Overpass `out body geom` elements (`{ type: 'way', id, nodes, geometry: [{ lat, lon }], tags }`).

- [ ] **Step 2: Run them and see them fail.** Run: `cd cityscope-backend && npx vitest run src/lib/streets.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `streets.ts` and `streetsRecordName`.** The collector keeps a `Map<osmNodeId, [lng, lat]>` and a `Map<wayId, osmNodeId[]>`; `toFile` sorts both and maps node ids to indexes.
- [ ] **Step 4: Run them and see them pass.** Run: `npx vitest run src/lib/streets.test.ts`. Expected: PASS.
- [ ] **Step 5: Write `fetch-streets.ts`.** Usage `npm run fetch:streets -- <city> [--tile <degrees>]`, default tile 0.1°. Tiles are fetched one at a time through `overpassFetch`, with a 5-second pause between them. Print each tile's ways and kept ways. Refuse to write a city with no ways. Write `data/streets-<city>.json` and `data/streets-<city>.source.json`: `fetchedAt` is when the last tile arrived, and `osmBase` is the oldest of the tiles' `osmBaseOf` values. Follow `fetch-parks.ts` for paths and messages.
- [ ] **Step 6: Fetch Sydney for real** (the smallest box). Run: `npm run fetch:streets -- sydney`. Expected: a non-empty `data/streets-sydney.json` that `parseStreetsFile` accepts, and a source record. Then run `npm run typecheck:scripts` and `npm test`: both pass.
- [ ] **Step 7: Commit**

```bash
git add cityscope-backend/src/lib/streets.ts cityscope-backend/src/lib/streets.test.ts cityscope-backend/src/lib/sourceDates.ts cityscope-backend/src/scripts/fetch-streets.ts cityscope-backend/package.json
git commit -m "feat(backend): fetch each city's walkable street network"
```

---

### Task 2: The street graph and nearest-node index

**Files:**
- Create: `cityscope-backend/src/lib/streetGraph.ts`, `streetGraph.test.ts`, `nodeIndex.ts`, `nodeIndex.test.ts` (all in `src/lib/`)

**Interfaces:**
- Consumes: `StreetsFile` (Task 1).
- Produces:
  ```ts
  export const EARTH_RADIUS_M = 6_371_008.8;
  export function haversineMetres(lng1: number, lat1: number, lng2: number, lat2: number): number;
  /** The largest connected part only, re-indexed in file order. Undirected: each edge is in both nodes' lists. */
  export interface StreetGraph {
    nodeCount: number; fileNodeCount: number;
    lngs: Float64Array; lats: Float64Array;
    offsets: Int32Array;      // length nodeCount + 1
    neighbours: Int32Array; lengths: Float64Array;
  }
  export function buildStreetGraph(file: StreetsFile): StreetGraph;
  export class NodeIndex {
    constructor(graph: StreetGraph, cellDegrees?: number);   // default 0.005
    nearest(lng: number, lat: number): { node: number; metres: number };  // always answers; widens its search ring by ring
  }
  ```

- [ ] **Step 1: Write the failing tests:**
  - `haversineMetres(0, 0, 0, 1)` is 111,195 m within 1 m.
  - Two ways sharing a node form one graph, and each edge appears in both nodes' neighbour lists with the haversine length.
  - A repeated consecutive node in a way adds no zero-length edge.
  - An island way that shares no node is dropped: `nodeCount` excludes it, and `fileNodeCount` includes it.
  - `NodeIndex.nearest` returns the nearest node and its distance.
  - **Review Focus 2:** a point a metre from a dropped island node and 40 m from a main-graph node returns the main-graph node, 40 m away.
  - A point 2 km outside every grid cell still gets an answer.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/lib/streetGraph.test.ts src/lib/nodeIndex.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Find the parts with a union-find or a breadth-first pass, keep the largest (on a tie, the one holding the lowest file index), and build the compressed adjacency arrays over the kept nodes only.
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** `streetGraph.ts`, `nodeIndex.ts` and their tests: `feat(backend): build a city's street graph and nearest-node index`.

---

### Task 3: Multi-source shortest-path search

**Files:**
- Create: `cityscope-backend/src/lib/multiSourceSearch.ts`, `multiSourceSearch.test.ts`

**Interfaces:**
- Consumes: `StreetGraph` (Task 2).
- Produces:
  ```ts
  /** A starting place: its node, the join distance already walked, and its rank (its position among the need's places, by id). */
  export interface Source { node: number; cost: number; rank: number }
  /** Per node: metres to its nearest source, that source's rank, and the next node towards it. Unreached: Infinity, -1, -1. A source node's prev is -1. */
  export interface SearchResult { dist: Float64Array; rank: Int32Array; prev: Int32Array }
  export function searchFromSources(graph: StreetGraph, sources: readonly Source[]): SearchResult;
  /** The nodes from `node` to its source, both included; [] when unreached. */
  export function pathToSource(result: SearchResult, node: number): number[];
  ```

- [ ] **Step 1: Write the failing tests** on a five-node line graph with equal 100 m edges (build it as a `StreetsFile` and pass it through `buildStreetGraph`):

```ts
it('each node takes its nearest source', () => {
  const r = searchFromSources(line, [{ node: 0, cost: 0, rank: 0 }, { node: 4, cost: 0, rank: 1 }]);
  expect(Array.from(r.rank)).toEqual([0, 0, 0, 1, 1]);   // node 2 is a tie: the lower rank wins
  expect(r.dist[3]).toBeCloseTo(100, 6);
});

it('a tie goes to the lower rank whatever the order the sources are given in', () => {
  const r = searchFromSources(line, [{ node: 4, cost: 0, rank: 1 }, { node: 0, cost: 0, rank: 0 }]);
  expect(r.rank[2]).toBe(0);
});

it('a join cost of 150 m at node 0 hands node 2 (350 m against 200 m) to the other source, but not node 1 (250 m against 300 m)', () => {
  const r = searchFromSources(line, [{ node: 0, cost: 150, rank: 0 }, { node: 4, cost: 0, rank: 1 }]);
  expect(Array.from(r.rank)).toEqual([0, 0, 1, 1, 1]);
  expect(r.dist[1]).toBeCloseTo(250, 6);
  expect(r.dist[2]).toBeCloseTo(200, 6);
});
```

Also:
- Two sources on one node keep the lower cost.
- A node in a part no source reaches has `dist` Infinity and `rank` −1.
- `pathToSource(r, 3)` is `[3, 4]`.
- [ ] **Step 2: Run them and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** Dijkstra with a binary min-heap keyed on `(dist, rank, node)`. A node's label improves when its distance is smaller, or equal with a lower rank. A popped entry that no longer matches the node's label is skipped.
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(backend): multi-source shortest-path search over the street graph`.

---

### Task 4: Nearest places by street and walk lines

**Files:**
- Create: `cityscope-backend/src/lib/walks.ts`, `walks.test.ts`, `networkNearest.ts`, `networkNearest.test.ts`

**Interfaces:**
- Consumes: `StreetGraph`, `NodeIndex`, `haversineMetres` (Task 2); `searchFromSources`, `pathToSource`, `Source` (Task 3).
- Produces:
  ```ts
  // walks.ts
  export const WALK_SIMPLIFY_METRES = 2;
  /** Douglas–Peucker in a local equirectangular projection; keeps both ends; rounds to 5 decimals; drops consecutive duplicates; always ≥ 2 points. */
  export function simplifyWalk(coords: readonly [number, number][], toleranceMetres?: number): [number, number][];
  // networkNearest.ts
  export const PARK_ENTRY_SPACING_METRES = 25;
  export const PARK_ENTRY_JOIN_METRES = 30;
  export const FAR_FROM_NETWORK_METRES = 150;
  export interface BlockInput { h3: string; lng: number; lat: number }
  export interface BlockJoin extends BlockInput { node: number; metres: number }
  /** A POI, or one entry point of a park (several rows share a park's placeId). */
  export interface PlaceInput { placeId: number; lng: number; lat: number }
  export interface NetworkRow { h3: string; placeId: number; metres: number; walk: [number, number][]; straightMetres: number }
  export interface NeedStats { rows: number; unreached: number; medianDetour: number | null }
  export function joinBlocks(index: NodeIndex, blocks: readonly BlockInput[]): { joins: BlockJoin[]; far: { h3: string; metres: number }[] };
  export function nearestByStreet(
    graph: StreetGraph, index: NodeIndex, joins: readonly BlockJoin[],
    places: readonly PlaceInput[], kind: 'poi' | 'park',
  ): { rows: NetworkRow[]; stats: NeedStats };
  ```
  Rules, from the Global Constraints:
  - **Ranks:** places are ranked by `placeId`, then input order.
  - **POIs:** a POI joins its nearest node.
  - **Parks:** a park's entry points within 30 m become sources; a park with none uses its single closest entry point.
  - **A row:** `metres = min(round(join.metres + dist[join.node]), 65534)`; `placeId` is the source's place; `walk = simplifyWalk([block centre, …path node coordinates…, the source's point])`; `straightMetres` is the haversine distance from the block centre to that point.
  - **Detour:** `medianDetour` is the median of `metres / straightMetres` over rows with `straightMetres > 0`.

- [ ] **Step 1: Write the failing tests.** In `walks.test.ts`:
  - collinear points simplify to their ends;
  - a corner 5 m off the line is kept;
  - coordinates round to 5 decimals;
  - consecutive duplicates go;
  - two identical points still give two points.

  In `networkNearest.test.ts`, on a hand-made "river" graph: two streets on either side of a gap, joined by one bridge 400 m away.
  - **Nearest by street differs from nearest in a straight line:** a POI 100 m across the gap loses to one 300 m away on the block's own side. The row's `metres` equals the block join plus the network distance plus the POI's join, and `walk[0]` is the block centre.
  - **Parks:** an entry point 20 m from a node joins; a park whose entry points are all over 30 m away uses its closest one. The walk ends at that entry point.
  - **Review Focus 4:** a block whose nearest node is the POI's node gets `walk` of exactly two points, `[centre, poi]`, and `metres` equal to the two joins.
  - **Unreached:** no places means no rows, and `unreached` equals the block count.
  - **Cap:** metres cap at 65534.
  - **Determinism:** shuffling the places' input order gives identical rows.
  - **Far blocks:** `joinBlocks` lists a block 200 m from the network in `far`, and not one 100 m away.
- [ ] **Step 2: Run them and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** `walks.ts` and `networkNearest.ts`.
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(backend): nearest places by street with simplified walk lines`.

---

### Task 5: Migration 005 and `reach:build --method network`

**Files:**
- Create: `cityscope-backend/src/scripts/migrations/005-reach-walks.sql`, `cityscope-backend/src/lib/buildReachArgs.ts`, `buildReachArgs.test.ts`
- Modify: `cityscope-backend/src/scripts/build-reach.ts` (move `parseArgs`/`Options` out; add the network path)

**Interfaces:**
- Consumes: Tasks 1–4 (`parseStreetsFile`, `buildStreetGraph`, `NodeIndex`, `joinBlocks`, `nearestByStreet`, `PARK_ENTRY_SPACING_METRES`); `NEEDS`, `PARK_MIN_AREA_M2` (`lib/needs.ts`).
- Produces:
  ```ts
  export type BuildMethod = 'network' | 'estimate';
  export interface BuildOptions { cityId: string; ghslDir: string; dryRun: boolean; method: BuildMethod }
  export function parseBuildArgs(argv: readonly string[], defaultGhslDir: string): BuildOptions | null;  // --method defaults to 'network'
  ```
  The `reach_nearest.walk` column (`geometry(LineString, 4326)`, null for estimate rows).

- [ ] **Step 1: Write the migration exactly:**

```sql
BEGIN;
ALTER TABLE reach_nearest ADD COLUMN IF NOT EXISTS walk geometry(LineString, 4326);
ALTER TABLE reach_nearest DROP CONSTRAINT IF EXISTS reach_nearest_walk_for_network;
ALTER TABLE reach_nearest ADD CONSTRAINT reach_nearest_walk_for_network
  CHECK (method <> 'network' OR walk IS NOT NULL);
COMMIT;
```

- [ ] **Step 2: Write the failing tests for `parseBuildArgs`:**
  - `['berlin']` gives method `network`;
  - `['berlin', '--method', 'estimate']` gives `estimate`;
  - `['berlin', '--method', 'walk']` gives `null`;
  - `['berlin', '--method']` gives `null`;
  - `['berlin', '--dry-run', '--ghsl', 'x']` keeps both;
  - two city ids give `null`.
- [ ] **Step 3: Run them and see them fail, then move and extend `parseArgs` into `buildReachArgs.ts`, and run them again.** Run: `npx vitest run src/lib/buildReachArgs.test.ts`. Expected: FAIL, then PASS. Update `usage()` to `<cityId> [--method network|estimate] [--ghsl <dir>] [--dry-run]`.
- [ ] **Step 4: Add the network path to `build-reach.ts`.** `estimate` keeps today's SQL untouched. For `network`:
  1. **Before any transaction:** read `data/streets-<city>.json`. If it is missing, exit with `No street network for <city>. Run npm run fetch:streets -- <city> first`. Then `buildStreetGraph` and a `NodeIndex`, and print the nodes kept against `fileNodeCount` as a share.
  2. **Blocks:** in `writeCity`, after the cells are inserted, `SELECT h3, ST_X(centre) AS lng, ST_Y(centre) AS lat FROM reach_cells WHERE city_id = $1 ORDER BY h3`. On a dry run, use the kept cells' `cellToLatLng` instead. Then `joinBlocks`, printing the median, 95th percentile and maximum join, and every `far` block.
  3. **POI needs:** `SELECT id, lng, lat FROM pois WHERE city_id = $1 AND category = ANY($2::text[]) ORDER BY id`.
  4. **Parks:** read the entry points with:
     ```sql
     SELECT k.id, ST_X(d.geom) AS lng, ST_Y(d.geom) AS lat
     FROM parks k
     CROSS JOIN LATERAL ST_DumpPoints(ST_Segmentize(ST_Boundary(k.geom)::geography, $3)::geometry) d
     WHERE k.city_id = $1 AND k.area_m2 >= $2
     ORDER BY k.id, d.path
     ```
     with `$2 = PARK_MIN_AREA_M2` and `$3 = PARK_ENTRY_SPACING_METRES`.
  5. **Write the rows:** `nearestByStreet`, then insert in batches of 1,000:
     `INSERT INTO reach_nearest (city_id, h3, need, place_kind, place_id, metres, method, walk) SELECT $1, x.h3, $2, $3, x.place_id, x.metres, 'network', ST_SetSRID(ST_GeomFromGeoJSON(x.walk), 4326) FROM unnest($4::text[], $5::int[], $6::int[], $7::text[]) AS x(h3, place_id, metres, walk)`,
     where `walk` is `{"type":"LineString","coordinates":…}`.
  6. **Print, per need:** rows, unreached blocks, median detour and time. **After all needs:** `SELECT sum(pg_column_size(walk))::bigint FROM reach_nearest WHERE city_id = $1` as MB.

  A dry run prints the same figures and writes nothing.
- [ ] **Step 5: Verify on the local stand-in.**
  1. Apply the migration: `DOTENV_CONFIG_PATH=.env.local-pg CITYSCOPE_DB_TARGET=local-pg npm run migrate -- 005-reach-walks.sql`.
  2. Dry run: `DOTENV_CONFIG_PATH=.env.local-pg npm run reach:build -- sydney --dry-run`. Expected: graph and join figures, and six needs with rows.
  3. Build: `DOTENV_CONFIG_PATH=.env.local-pg CITYSCOPE_DB_TARGET=local-pg npm run reach:build -- sydney`. Expected: 200 cells and 6 × (200 − unreached) rows, all `method = 'network'` with a walk.
  4. Run `npm run typecheck:scripts` and `npm test`: both pass.
- [ ] **Step 6: Commit** in two commits, the migration first:

```bash
git add cityscope-backend/src/scripts/migrations/005-reach-walks.sql
git commit -m "feat(backend): migration 005 stores each reach walk"
git add cityscope-backend/src/lib/buildReachArgs.ts cityscope-backend/src/lib/buildReachArgs.test.ts cityscope-backend/src/scripts/build-reach.ts
git commit -m "feat(backend): reach:build measures walks along the street network"
```

---

### Task 6: Calibrate and publish by method

**Files:**
- Create: `cityscope-backend/src/lib/reachMethod.ts`, `reachMethod.test.ts`
- Modify: `cityscope-backend/src/lib/reachPayload.ts`, `reachPayload.test.ts`, `src/scripts/calibrate-reach.ts`, `src/scripts/publish-reach.ts`

**Interfaces:**
- Consumes: `streetsRecordName`, `readFetchRecord` (`lib/sourceDates.ts`).
- Produces:
  ```ts
  export type ReachMethod = 'estimate' | 'network';
  export function isReachMethod(value: unknown): value is ReachMethod;
  /** The one method a city's reach_nearest rows were built with; throws on none, a mix, or an unknown one. */
  export function methodOfRows(methods: readonly string[]): ReachMethod;
  // reachPayload.ts
  //   CalibrationRow gains `method: ReachMethod`; ReachMeta.method becomes ReachMethod (from cal.method).
  //   ReachInfo gains `streets: FetchRecord`; ReachSources gains `streetsFetchedAt: string | null; streetsOsmBase: string | null`.
  ```

- [ ] **Step 1: Write the failing tests:**
  - `methodOfRows(['network'])` is `'network'`;
  - `methodOfRows([])` throws `/no nearest places/`;
  - `methodOfRows(['estimate', 'network'])` throws `/mixes/`;
  - `methodOfRows(['bus'])` throws `/unknown/`.

  In `reachPayload.test.ts`:
  - `meta.method` follows `cal.method`;
  - `meta.sources.streetsFetchedAt` and `streetsOsmBase` come from `info.streets`, and are null for an estimate build.
- [ ] **Step 2: Run them and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`calibrate-reach.ts`:** read `SELECT DISTINCT method FROM reach_nearest WHERE city_id = $1` into `methodOfRows`, store that method (a parameter replaces the `'estimate'` literal in `UPSERT_CALIBRATION_SQL`), and print `walking time = street metres / k` for `network`, today's line for `estimate`.
  - **`publish-reach.ts`:** accept either method via `isReachMethod`, and read `data/streets-<city>.source.json` for `network`, or nulls for `estimate`.
- [ ] **Step 4: Run them and see them pass**, then on the local stand-in run `reach:calibrate -- sydney` and `reach:publish -- sydney`. Expected: no Mapbox requests (the cache), `method network` stored, and the published payload's `meta.method` is `network` with street source dates.
- [ ] **Step 5: Commit**: `feat(backend): calibrate and publish reach by the method it was built with`.

---

### Task 7: The block card returns each walk

**Files:**
- Modify: `cityscope-backend/src/lib/reachPayload.ts` (`CardRow`, `CellCard`, `shapeCellCard`, new `parseWalk`), `reachPayload.test.ts`, `cityscope-backend/src/routes/reach.ts`

**Interfaces:**
- Produces:
  - `CardRow.walk: [number, number][] | null`, and each `CellCard.needs[]` item gains `walk: [number, number][] | null`;
  - `export function parseWalk(geojson: string | null): [number, number][] | null;`

- [ ] **Step 1: Write the failing tests:**
  - `shapeCellCard` passes a row's `walk` through;
  - a need with no row has `walk: null`;
  - `parseWalk('{"type":"LineString","coordinates":[[1,2],[3,4]]}')` is `[[1, 2], [3, 4]]`;
  - `parseWalk(null)` is `null`;
  - a Point or malformed text is `null`.
- [ ] **Step 2: Run them and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement**, and change `CARD_SQL`:
  - add `ST_AsGeoJSON(n.walk, 5) AS walk`;
  - for a park, put its `lng`/`lat` at `ST_X(ST_EndPoint(n.walk))` / `ST_Y(…)` when `n.walk IS NOT NULL`, otherwise today's `ST_ClosestPoint`.
- [ ] **Step 4: Run them and see them pass**, then check the route in-process. Run a throwaway copy of the Express app on port 3098 against the local stand-in (as Phase 1 did; never the owner's :3001), and `curl` one Sydney block card. Expected: six needs, each within reach with a `walk` array whose first point is the block centre, and each park's `lng`/`lat` equal to its walk's last point.
- [ ] **Step 5: Commit**: `feat(backend): the reach block card returns each walk`.

---

### Task 8: Frontend: walks on the map, wording by method

**Files:**
- Modify: `cityscope/src/lib/reach/model.ts`, `card.ts`, `card.test.ts`, `copy.ts`, `copy.test.ts`, `cityscope/src/components/reach/ReachMethodNote.tsx`, `ReachPanel.tsx`

**Interfaces:**
- Consumes: the card's `walk` (Task 7) and `meta.method` / `meta.sources.streetsFetchedAt` (Task 6).
- Produces:
  - `export type ReachMethod = 'estimate' | 'network'`, with `ReachMeta.method: ReachMethod`;
  - `ReachMeta.sources` gains optional `streetsFetchedAt?: string | null` and `streetsOsmBase?: string | null`;
  - `CellCardNeed.walk?: [number, number][] | null`. It's optional because a browser-cached card from before the deploy has no `walk`;
  - `rangeExplanation(kLow: number, kHigh: number, method: ReachMethod): string`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('draws the walk along the streets when the card has one', () => {
  const walk: [number, number][] = [[13.4, 52.5], [13.401, 52.5003], [13.402, 52.5007]];
  const card = withWalk(CARD, 'st', walk);
  const line = linkLines(card, PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features.find((f) => f.properties!.need === 'st')!;
  expect(line.geometry.coordinates).toEqual(walk);
});
it('draws the straight line for a card with no walk, including one cached before walks existed', () => {
  // The existing CARD fixture predates walks: its needs have no `walk` key at all.
  const line = linkLines(CARD, PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features[0];
  expect(line.geometry.coordinates[0]).toEqual([13.4, 52.5]);
  expect(line.geometry.coordinates).toHaveLength(2);
  const nullWalk = linkLines(withWalk(CARD, 'pk', null), PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features[0];
  expect(nullWalk.geometry.coordinates).toHaveLength(2);
});
it('rangeExplanation names the pace by street for a street build', () => {
  expect(rangeExplanation(62.5, 70, 'network')).toBe(
    'How far the figure moves if walking pace is anywhere from 62.5 to 70 metres a minute along streets: the calibration\'s uncertainty.',
  );
  expect(rangeExplanation(62.5, 70, 'estimate')).toContain('straight-line metres a minute');
});
```

`withWalk(card, need, walk)` is a local helper that returns a copy of the card with that need's `walk` set.
- [ ] **Step 2: Run them and see them fail.** Run: `cd cityscope && npx vitest run src/lib/reach`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`linkLines`:** use `found.walk` when it has at least two points, otherwise `[centre, [lng, lat]]`.
  - **`ReachPanel`:** pass `m.method` to `rangeExplanation`.
  - **`ReachMethodNote`** with `meta.method === 'network'` uses this exact wording:
    - **Method:** "Each block's walk to a need follows streets and footpaths from the block's centre to the nearest place by street, at {k} metres a minute. That pace was fitted against Mapbox walking times on {sampleSize} blocks."
    - **Sources,** after Places, when `streetsFetchedAt` is set: "Streets: © OpenStreetMap contributors, fetched {formatDate(streetsFetchedAt)}."
    - **Limits:** "Distances are measured along streets and paths from each block's centre."

    `estimate` keeps today's text.
- [ ] **Step 4: Run them and see them pass**, then the whole frontend check. Run: `npm test && npm run lint && npm run build`. Expected: all pass. The colour guard still passes.
- [ ] **Step 5: Commit**: `feat(web): draw each reach walk along the streets, with wording by method`.

---

### Task 9: A stale card heals itself

**Files:**
- Modify: `cityscope/src/lib/reach/api.ts`, `api.test.ts`, `card.ts`, `card.test.ts`, `cityscope/src/hooks/useReachCard.ts`

**Interfaces:**
- Consumes: `cardIsStale` (`card.ts`).
- Produces:
  ```ts
  export function fetchReach(apiBase: string, cityId: string, cache?: RequestCache): Promise<ReachPayload>;        // default 'default'
  export function fetchReachCard(apiBase: string, cityId: string, cell: string, cache?: RequestCache): Promise<CellCard>;
  export function healKey(payload: ReachPayload, cell: string): string;    // `${meta.city}|${meta.builtAt}|${cell}`
  export function shouldHeal(attempted: ReadonlySet<string>, key: string, stale: boolean): boolean;
  ```

- [ ] **Step 1: Write the failing tests:**
  - `fetchReach(B, 'berlin', 'reload')` calls `fetch` with the URL and `{ cache: 'reload' }`, and without a third argument with `{ cache: 'default' }`; the same for `fetchReachCard`.
  - `healKey` changes when `meta.builtAt` changes.
  - **Review Focus 5:** `shouldHeal(new Set([k]), k, true)` is false, `shouldHeal(new Set(), k, false)` is false, and `shouldHeal(new Set(), k, true)` is true.

  Update the existing `api.test.ts` assertions that expect a one-argument `fetch` call.
- [ ] **Step 2: Run them and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `useReachCard.ts`, keep a module-level `const healAttempts = new Set<string>()`; both `MapView` and `ReachCard` call this hook, and effects run one after another, so one set prevents a double fetch. Add an effect:
  1. **When:** the card and payload are loaded, the selected block's feature is in the payload, and `cardIsStale(card, props, payload.meta.metresPerMinute)`.
  2. **Guard:** `shouldHeal(healAttempts, key, true)` decides; on true, add the key first.
  3. **Fetch:** `Promise.all([fetchReach(API_BASE, cityId, 'reload'), fetchReachCard(API_BASE, cityId, cell, 'reload')])`.
  4. **On success:** `queryClient.setQueryData(['reach', cityId], payload)` and `setQueryData(['reach-card', cityId, cell], card)`.
  5. **On failure:** do nothing, so the card keeps its message.
- [ ] **Step 4: Run them and see them pass.** Run: `npm test && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat(web): a stale reach card refetches once instead of asking for a reload`.

---

### Task 10: The before-and-after comparison

**Files:**
- Create: `cityscope-backend/src/lib/reachCompare.ts`, `reachCompare.test.ts`, `cityscope-backend/src/scripts/compare-reach.ts`
- Modify: `cityscope-backend/package.json` (`"reach:compare": "tsx src/scripts/compare-reach.ts"`)

**Interfaces:**
- Consumes: the backend `ReachPayload` type (`lib/reachPayload.ts`).
- Produces:
  ```ts
  /** Share of residents with all six needs within `minutes` at metres-per-minute k. */
  export function shareWithin(payload: ReachPayload, minutes: number, k: number): number;
  export interface ReachComparison {
    agreement: { before: Record<Band, number>; after: Record<Band, number> };
    baseRates: { before: Partial<Record<Band, number>>; after: Partial<Record<Band, number>> };   // meta.completeness.checks.calibrationBaseline[band].insideShare
    headline: { before: { k: number; low: number; high: number }; after: { k: number; low: number; high: number } };   // 15 min, all six, at k, kLow, kHigh
    colourChanged: Record<5 | 10 | 15, number>;   // share of residents whose class (missing needs, capped at 2) differs, each payload at its own k
    blocks: { matched: number; onlyBefore: number; onlyAfter: number };
  }
  export function compareReach(before: ReachPayload, after: ReachPayload): ReachComparison;
  ```

- [ ] **Step 1: Write the failing tests** on two three-block payloads with known metres and k:
  - `shareWithin` matches a hand count;
  - `colourChanged[5]` counts a block whose class goes from 0 to 1 by its residents, with each payload judged at its own k;
  - blocks are matched by `h`, and a block in one payload only is counted in `onlyBefore`/`onlyAfter` and left out of the shares.
- [ ] **Step 2: Run them and see them fail; implement; run them and see them pass.** Run: `npx vitest run src/lib/reachCompare.test.ts`.
- [ ] **Step 3: Write `compare-reach.ts`.** Usage `npm run reach:compare -- <city>`. Read the "before" from `data/reach-before/<city>.json`, and the "after" from the database `reach_payloads` row (Brotli-decompress `body`) on a read-only transaction. Print one Markdown table row for the README.
- [ ] **Step 4: Commit**: `feat(backend): compare a city's reach before and after the street rebuild`.

---

### Task 11 (controller): Berlin end to end on the local stand-in

- [ ] **Step 1: Save every city's current production payload as the "before"** (a read-only GET): `curl --compressed -s https://cityscope-rzj5.onrender.com/api/cities/<city>/reach -o data/reach-before/<city>.json`, for all eight. Check each parses and has `meta.method` `estimate`.
- [ ] **Step 2: Fetch, build, calibrate and publish Berlin by street**, locally: `npm run fetch:streets -- berlin`, then `reach:build -- berlin`, `reach:calibrate -- berlin` and `reach:publish -- berlin`, with `DOTENV_CONFIG_PATH=.env.local-pg CITYSCOPE_DB_TARGET=local-pg`. Keep the full output. Calibration must make no Mapbox requests.
- [ ] **Step 3: The size budget.** Bytes per walk is Berlin's `pg_column_size` sum divided by its rows; multiplied by 254,550 walks, that's the projection. **Over 120 MB: stop and bring it to the owner.**
- [ ] **Step 4: Run `npm run reach:compare -- berlin`.** Held-out agreement at 5 minutes must beat 87.8%. If it doesn't, investigate before going on (success criterion 2).
- [ ] **Step 5: Browser check.** Ask the owner to restart their backend against the local database for the check (`DOTENV_CONFIG_PATH=.env.local-pg npm run dev`), and to switch it back afterwards. Then, in the built-in browser pane at the owner's :5173, with the pane visible:
  1. Open block `891f1d482b7ffff` (Schlosspark Charlottenburg) at 15 minutes, all six needs.
  2. The walk lines follow streets and paths, the park's pin sits on its edge, and the method note says "by street".
  3. No console errors. Take a screenshot.
  4. Record the block card's response size for ten Berlin blocks, typical and largest (the spec asks for both).
- [ ] **Step 6: Self-healing check.** Prime the browser with Berlin's straight-line payload before the rebuild: open Berlin while the local database still holds the estimate build. Alternatively, rebuild Berlin `--method estimate` and publish, open it, then rebuild by street and publish. Then click a block: the walks appear without a reload, and the network panel shows one `cache: reload` pair of requests.

---

### Task 12 (controller): The other seven cities, and the documentation

- [ ] **Step 1: The other seven, locally:** for Amsterdam, London, Munich, New York, Paris, Sydney and Tokyo, run `fetch:streets`, `reach:build`, `reach:calibrate`, `reach:check-gp` (London only) and `reach:publish`, then `reach:compare`.
  - Every city must pass at 15 minutes and beat its Phase 1 5-minute figure.
  - Total walk storage must stay within the budget.
  - Each payload's compressed size is within 2% of its "before", or the growth is explained.
- [ ] **Step 2: Find the new "Where it breaks" blocks** from the calibration output (most wrong held-out checks), as the reach spec's Phase 2 amendments describe, and build their share links the same way.
- [ ] **Step 3: Write the documentation.**
  - **The README:** the method paragraph, a "Straight line vs street" section, the headline table, "Where it breaks", and the commands, adding `fetch:streets` and `reach:compare` and noting that `reach:build` defaults to `--method network`.
  - **`CLAUDE.md`:** the pipeline, the rebuild rule after `fetch:streets`, migration 005, and the never-commit list adding `data/streets-*` and `data/reach-before/`.
  - **The spec:** a "Measured results" section in `2026-11-21-street-network-walking-design.md`, and a pointer to it from the reach spec's Non-goals.

  One commit per file.

---

### Task 13 (controller): The production run, each stage with the owner's go-ahead

- [ ] **Step 1: Checks before writing anything.**
  - **Storage headroom:** the owner checks it in the Neon console against the projection.
  - **Rollback point:** the owner creates the rollback branch.
  - **Read-only check:** `reach_nearest` has no `walk` column yet.
- [ ] **Step 2: Migration 005 on production** (go-ahead): `DOTENV_CONFIG_PATH=.env.production-direct CITYSCOPE_DB_TARGET=production npm run migrate -- 005-reach-walks.sql`. Then a read-only check that the column and constraint exist.
- [ ] **Step 3: The owner merges the branch.** Render and Vercel deploy. Check on the live site:
  - the straight-line cards still answer, with `walk: null`;
  - the method note still says straight-line;
  - no console errors.
- [ ] **Step 4: Prime a browser.** In the built-in browser, open Berlin and London on the live site, so the self-healing case can be checked after the switch.
- [ ] **Step 5: At a quiet hour, city by city.** One go-ahead per city covers `reach:build`, `reach:calibrate`, `reach:check-gp` (London) and `reach:publish`, run back to back with `DOTENV_CONFIG_PATH=.env.production-direct CITYSCOPE_DB_TARGET=production`, from the same street files as the local run.
  - Read the printed host before each.
  - Record each city's gap, from the build's COMMIT (the build's delete and rebuild are one transaction, so visitors keep the old payload until then) to the end of the publish.
- [ ] **Step 6: Verify.**
  - **Payloads:** each city's production payload matches the local one block for block, differing only in `builtAt` and `sources.calibratedAt`.
  - **API checks:** rerun the Phase 1 API checks: Brotli, ETag, `304`, plain JSON, and a card with walks.
  - **Live site:** the three "Where it breaks" blocks look right.
  - **Self-healing:** in the primed browser, a click shows the walks without a reload.
- [ ] **Step 7: Update the documentation** with the production figures (README headline table, spec results). Then update `CLAUDE.md`'s status lines and the memory files.
