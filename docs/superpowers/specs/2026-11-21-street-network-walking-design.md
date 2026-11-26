# Everyday Reach by Street — Design

**Date:** 2026-11-21
**Status:** Approved by the owner on 2026-11-21, built on `reach/street-network` and measured (see Measured results)
**Branch:** `reach/street-network`, off `main`
**Builds on:** `docs/superpowers/specs/2026-10-17-everyday-reach-design.md` (the reach spec). Read its Phase 1 and Phase 2 amendments first: this design changes how distances are measured and nothing else about the layer.

## Why

Everyday reach estimates each walk as the straight-line distance from a block to the nearest place, divided by a per-city "straight-line metres a minute" fitted against Mapbox walking isochrones. Straight lines ignore rivers, railways, motorways and walled parks, so a block beside a barrier is credited with places it can't easily walk to, and the single fitted pace is too slow on an open street grid and too fast beside a river. The reach spec planned street-network distances as the later replacement and shaped the storage for it.

The owner is job-hunting for mapping, property, logistics and urban-tech roles. This change should:

- make the numbers more trustworthy, where today's are weakest: at 5 minutes, held-out agreement with Mapbox is 85.0–93.3%, so about one check in ten disagrees;
- give an interview story: a shortest-path search over each city's real street network, checked against an independent source, with a measured before and after;
- be visible within a click, not only in the README.

## What changes for a visitor (owner's choice: "level 2")

- **Distances follow streets and footpaths.** Every populated block's walk to each need is measured along the street network, and the nearest place is the nearest by street, which can be a different place from the nearest in a straight line.
- **Clicking a block draws each walk along the streets**, instead of today's straight line from the block's centre to the place. As today, only chosen needs within the time limit get a line and a pin.
- **The wording says "by street"**: the method note, the range line and the README.
- Everything else is unchanged: the panel, the colours and 3D columns, the time stops, the share links, the welcome example, the payload's format and size.

## Goals

1. Street-network metres and nearest places for all eight cities, built ahead of time, in the same tables and payload fields as today.
2. The walk drawn along the streets on the block card's map lines, fetched for the clicked block only.
3. The same calibration, honesty bar (80% held-out agreement) and bootstrapped range, now fitted on street metres.
4. A measured before and after, published in the README.

## Non-goals

- **An in-app comparison** between straight-line and street distances, or a highlight of blocks that changed (the owner's "level 3"). The comparison lives in the README.
- Cycling, hills, waits at crossings, opening hours. (The fitted pace absorbs the average effect of hills and crossings; the street-by-street effect is not modelled.)
- **pgRouting, or a routing engine such as OSRM or Valhalla.** See "Approaches".
- Routing on demand when a block is clicked. Walks are built ahead of time, like everything else in the layer.
- Changing the payload format. London's payload is over its 450 KB target; that is separate work.
- Changing the isochrone or route tools, which call Mapbox directly.

## Anti-goals (a failure even if it works)

- **Shipping a city whose street distances agree with Mapbox worse than its straight-line estimate did, without saying so.**
- **The card contradicting the colour**: a walk drawn to a place the colour didn't count, or a walk whose length differs from the metres the card and colour use.
- **Storing the street network in the production database.** Production receives results only.
- A slower map or a bigger map download.
- A build that gives different answers from the same inputs. Phase 1's production load reproduced the local run block for block; this must too.

## Approaches

The difference between them is where the shortest paths are worked out.

| | How | For | Against |
|---|---|---|---|
| **A. In the build script, in memory (chosen)** | `reach:build` loads the city's street network from a file, runs one multi-source search per need, and writes metres, the nearest place and a simplified walk line per block and need | Production receives results only; about a second or two per need per city (estimate); pure-logic tests like the rest of the pipeline; no new database extension; the owner can explain every step | Hand-built graph construction and snapping that a routing library would provide; London's network needs care with memory |
| B. pgRouting in PostGIS | Load the network into tables, run `pgr_drivingDistance` with every place as a start (`equicost`) | The standard PostGIS routing extension, recognisable to GIS employers; fits "PostGIS as a spatial engine" | The network has to live in a database: in production an estimated several hundred MB on a 171 MB database, and Neon keeps a history of changes, so loading and dropping it still costs; in practice it would run on a local database with results copied across, a new two-database step. Tests would need a database |
| C. A routing engine (OSRM, Valhalla) | Route each block to a few straight-line candidates per need | Industry tools; snapping and edge cases handled | Answers point to point, not "nearest of thousands", so it misses the nearest place by street when that place isn't among the straight-line candidates: the river case this feature exists for. Docker toolchain |

**The owner chose A** (2026-11-21), on the recommendation that it keeps production as it is, keeps the tests pure, and gives the clearest story; pgRouting is the alternative weighed and set aside, and the README or interview can say why.

## Measured facts this design rests on (2026-11-20/21)

- **Walkable ways** (Overpass `out count`, highway values listed under "The street network"): London's box (51.28, −0.52, 51.70, 0.34) has **692,031 ways**; Paris's (48.81, 2.22, 48.91, 2.47) has 201,231 ways with **679,697 nodes**. On Paris's ratio, London's network has roughly 2.3 million nodes (estimate).
- **pgRouting 3.8.0 is available on the production database but not installed**, alongside PostGIS 3.6 (read-only check, `SHOW transaction_read_only` = `on`). The local PostgreSQL 18 install also has pgRouting. Neither is needed by approach A.
- **The production database is 171 MB.**
- **Calibration searches `k` from 30 to 150 m/min in 0.5 steps** (`lib/calibration.ts`), so a fitted pace near a real walking speed (people walk at roughly 1.2–1.5 m/s, 72–90 m/min) is inside the search range without changes.
- **The calibration sample is drawn from the city's cells with a fixed seed**, and the cells don't change (same GHSL tiles, same outlines), so a street-network recalibration reuses the cached Mapbox isochrones in `data/isochrones/<city>/`: **no Mapbox requests**.
- **The frontend does not check `meta.method`** when it reads a payload (`lib/reach/api.ts`); the type says `'estimate'`, and the method note always says "straight-line".
- **Populated blocks across the eight cities:** 42,425, so 254,550 walks (six per block).

## Design

### The street network (`npm run fetch:streets -- <city>`)

- **Source:** Overpass, through `overpassFetch` (its `User-Agent`, retries and partial-answer check). The area is the city's `fetchBounds` (outline plus 2 km, the box places and parks are fetched over), **split into tiles** small enough for Overpass to answer; ways that appear in two tiles are kept once, by way id.
- **Walkable ways:** `highway` = `footway`, `path`, `pedestrian`, `steps`, `living_street`, `residential`, `service`, `unclassified`, `road`, `track`, `cycleway`, `bridleway`, `corridor`, `tertiary`, `tertiary_link`, `secondary`, `secondary_link`, `primary`, `primary_link`, `trunk`, `trunk_link`.
  - **Left out:** `motorway` and `motorway_link`; any way tagged `foot=no`; any way tagged `access=private` or `access=no` unless it also has `foot=yes`, `designated` or `permissive`; `highway=construction` and `proposed`; ferries.
  - One-way tags don't apply on foot. Bridges and tunnels are included: they are how barriers are crossed. Ways connect only where they share an OSM node, so a bridge does not connect to the road beneath it.
  - Pedestrian areas mapped as closed ways are walked around their edge, not across (slightly long; accepted).
- **Output:** `cityscope-backend/data/streets-<city>.json` (git-ignored, like everything in `data/`) in a **compact form**: each node's id and coordinates once, and each way as a list of node ids. Not Overpass's raw answer, which for London would be hundreds of MB of JSON. A sidecar `streets-<city>.source.json` records `{ fetchedAt, osmBase }` as the other fetches do.
- **Never committed**, like the park files. The production run reads the same files the development run used.

### The graph (`src/lib/streetGraph.ts`, pure)

- **Nodes are OSM nodes; edges join consecutive nodes along each way**, undirected, weighted by their length in metres.
- **Held in typed arrays** (a compressed adjacency list: offsets, neighbours, lengths; coordinates as `Float64Array`), so London's ~2.3 million nodes fit in roughly 100 MB (estimate).
- **Only the largest connected part is kept.** Small islands (a footpath network mapped with no link to the streets) would otherwise trap a block or a place that joins onto them. The build prints the share of nodes kept.

### Joining blocks, places and parks to the network

- **A block's walk starts at its centre** (the `reach_cells.centre` used today), joined to the nearest node of the kept graph. The straight distance from the centre to that node is added to the walk.
- **A place (POI) joins its nearest node**; the straight distance from that node to the place is added.
- **A park counts from its edge**, as today. Its entry points are points every 25 m along its outline, each joined to the nearest node within 30 m. A park with no entry point within 30 m of the network joins through the single nearest node to its outline. Only parks of at least 0.5 ha count, as today.
- **Nearest-node lookups use an in-memory grid index** over the kept nodes.
- **The build prints the join distances** (median, 95th percentile, maximum) for blocks and places, and lists any block whose centre is more than 150 m from the network, so a gap in the street data is seen, not hidden.

### The search (one per need)

- **A multi-source shortest-path search (Dijkstra with a binary heap) per need**, starting from every place of that need at once, each start carrying its join distance as its initial cost. Every node ends up with the distance to its nearest place by street, which place that is, and the previous node on the way there.
- **A block's metres** are its join distance plus its node's distance, rounded and capped at 65534 as today. A block whose node no place reaches gets no row, so it reads as `NONE_FOUND_METRES` (65535), as a city with no place for a need does today.
- **Deterministic:** ties are broken by a fixed order (place id, then node id), so the same inputs always give the same output.

### Walk lines

- **Each walk is traced back along the previous-node chain** from the block's node to the place's node, and drawn from the block's centre to the place (for a park, to the entry point where the walk reaches it).
- **Simplified** (Douglas–Peucker, about 2 m tolerance), with coordinates rounded to 5 decimals, as the payload's outlines are. The walk's length is not recomputed from the simplified line: the stored metres stay the search's.
- **Size budget.** Estimated at 30–90 MB for all eight cities. Berlin is built first and measured; if the projection for all eight exceeds 120 MB, stop and bring it to the owner before going on.

### Storage (migration `005-reach-walks.sql`)

- `reach_nearest` gains `walk geometry(LineString, 4326)`, nullable. Rows built by the straight-line estimate leave it null.
- A check: `method <> 'network' OR walk IS NOT NULL`.
- `method` holds `'network'` for rows built by street. `reach_calibration.method` records the method of the rows it was fitted on.
- Nothing else changes: no table for the street network, in any database.

### Scripts

- **`reach:build -- <city> [--method network|estimate]`**, defaulting to `network`. It builds cells exactly as today; with `network` it reads the city's places and parks (with their ids) from the database and the street network from `data/streets-<city>.json`, runs the six searches, and writes `reach_nearest` with metres, place, `method = 'network'` and the walk. `estimate` is today's SQL path, kept as the fallback. A missing streets file stops a network build with a message naming `fetch:streets`.
- **`reach:build --dry-run`** with `network` also loads the graph and prints its size, the kept share, the join distances and each need's searched blocks, writing nothing, so production's inputs can be checked read-only.
- **The build prints each need's detour factor**: the median ratio of street metres to straight-line metres to the same place, a figure for the README.
- **`reach:calibrate`** is unchanged in method: it fits `k` on the stored metres (now street metres) against the cached isochrones, with the same split, bar and bootstrap. It refuses a city whose `reach_nearest` rows mix methods. Its printout and the `method` it stores follow the rows.
- **`reach:publish`** accepts `'network'` as well as `'estimate'` and writes it into `meta.method`. `meta.sources` gains `streetsFetchedAt` and `streetsOsmBase` (null for an estimate build).
- **`reach:check-gp`** is unchanged (it doesn't use distances by street).
- **The rebuild rule** extends: after a new `fetch:streets` for a city, rerun `reach:build`, `reach:calibrate` (and `reach:check-gp` for London) and `reach:publish`. A place reload already forces the same rebuild.

### API

- **`GET /reach`** is unchanged: same fields, now street metres, and `meta.method` says which.
- **`GET /reach/:cellId`** adds `walk` to each need: the walk's coordinates (a GeoJSON LineString's `coordinates`) for a network build, `null` for an estimate build. For a park on a network build, the place's `lng`/`lat` are the walk's end (where it reaches the park) instead of the park's point nearest the block's centre.
- Card responses grow by the walks of one block; report the typical and largest sizes.

### Frontend

- `ReachMeta.method` becomes `'estimate' | 'network'`, and `CellCardNeed` gains `walk: [number, number][] | null`.
- **`linkLines` draws the walk** when the card has one, and today's straight line otherwise. The stale-card rule is unchanged: a stale card draws no lines.
- **Wording follows `meta.method`**: for `network`, the method note describes walks along streets and footpaths from the block's centre to the nearest place by street, at `k` metres a minute; the range line drops "straight-line"; the "Distances are measured…" line says "along streets and paths". For `estimate`, today's wording.
- **The frontend ships before any network payload is published**, so a deployed page never shows straight-line wording over street distances.
- **A stale card heals itself (owner's choice, 2026-11-21).** Both `GET /reach` and the card are cached by the browser for a day (`Cache-Control: public, max-age=86400`), so after the switch a returning visitor can hold yesterday's straight-line payload and fetch a card built by street, or the reverse. Today the card then says "Reload to update" and draws no lines, and a reload doesn't help because the browser serves its cached copies. Instead, when a card is stale the app fetches the payload and that card once more, bypassing the browser's cache (`fetch` with `cache: 'reload'`), and replaces them in the query cache, so the walks appear without the visitor doing anything.
  - At most once per city's payload version and block, so it can never loop. The version is the payload's `meta.builtAt`: the browser's `fetch` hands the app the body, not the ETag.
  - If the two still disagree, or a fetch fails, the card keeps today's message and draws no lines. During a city's gap the fresh payload request answers 404: that counts as a failure, so the visitor keeps the map they have and the card's message until they pick a block after the city is published.
  - The API's caching is unchanged.

### Measuring the before and after

- **Before rebuilding, keep each city's current (straight-line) payload** from production's `GET /reach` in `data/` as the "before".
- **For each city, record**: held-out agreement at each limit and the base rates, before and after; the headline (all six needs, 15 minutes) and its range, before and after; the share of residents whose block changes colour at 5, 10 and 15 minutes with all six needs; each need's detour factor; the new "Where it breaks" blocks.
- **The README** gets a short "Straight line vs street" section with the agreement table and these figures, and its headline table and "Where it breaks" are updated.

### Development and the production run

- **Development builds use the local PostgreSQL stand-in** (my call; the owner chose it for Phase 1), seeded from the committed place files and the 2026-10-20 park files, like Phase 1. A Neon branch (`reach-dev`) works too if the owner prefers.
- **Order:** Berlin end to end first (its "Where it breaks" block sits beside Schlosspark Charlottenburg), then the other seven.
- **Production, each stage only with the owner's go-ahead:** a Neon rollback branch; migration 005, **before the branch is merged**, because the deployed card route reads the new `walk` column and would fail without it; then per city `reach:build` (network), `reach:calibrate` (no Mapbox requests), `reach:check-gp` for London, `reach:publish`. No place or park reseed is needed. Every city's production payload must match the local run block for block, differing only in its timestamps. **The frontend change, with the self-healing card, is merged and deployed before the first production publish.**
- **Keep each city's gap short (owner's choice, 2026-11-21).** The layer is live, and `reach:build` deletes the city's payload when it commits (visitors keep the old payload until then), so the city shows "Not built for this city yet" until `reach:publish` (an estimated few minutes per city, longer for London). Run the switch at a quiet hour, one city straight after another. The owner's go-ahead for a city covers its build, calibrate, GP check and publish together, so the gap is never held open waiting for the next go-ahead. Record each city's gap in the run notes.
- **Check storage headroom before the production load:** the database grows by the walks, and the rebuild rewrites every `reach_nearest` row, which Neon's change history also holds for a while.

## Testing (Vitest, pure logic)

- **Way filter:** included and excluded highway values, `foot=no`, private access with and without a foot exception.
- **Graph:** ways sharing a node connect and ways crossing without one don't; duplicate ways from two tiles count once; edge lengths; the largest-part filter.
- **Search:** each node gets its nearest source and distance on hand-made graphs, including two sources at equal distance (the tie rule), a node no source reaches, and initial costs.
- **Paths:** the traced walk runs block → place, starts at the block's centre and ends at the place or park entry point.
- **Joins:** nearest node through the grid index; park entry points every 25 m and the 30 m rule with its fallback.
- **Simplification:** endpoints kept, coordinates rounded, the metres untouched.
- **Card shaping and the route:** `walk` present for network rows and null for estimate rows; a park's position is the walk's end.
- **Publish:** `meta.method` and the street source dates.
- **Frontend:** `linkLines` follows the walk when present and the straight line otherwise; no lines from a stale card; the wording for each method; the stale-card refetch happens once per payload version and block, and not again after a second mismatch or a failure.

## Success criteria

1. All eight cities built by street, calibrated and published; every city passes the bar at 15 minutes.
2. **Held-out agreement at 5 minutes is higher than the reach spec's Phase 1 figure in every city.** A city where it isn't is investigated before it is published by street, and keeps the estimate unless the owner decides otherwise.
3. The block card draws each walk along the streets; the three current "Where it breaks" blocks are checked by eye in the browser. A browser holding a city's straight-line payload from before the switch shows the walks after one click on a block, with no reload.
4. The map payload keeps its format: the same properties per block, no new per-block data. Each city's compressed size is reported before and after, and any growth over 2% is explained. (My call: a percentage alone can't be the gate. Sydney's payload is 8,375 B, so the two new source dates and timestamp changes alone move it by about 1–2%.)
5. The database growth is measured and within the size budget above.
6. The README, `CLAUDE.md` and the reach spec say what changed, with the before and after measured.
7. Backend and frontend tests, the type checks, lint and build pass.

## Left to the builder

- Tile size and the exact Overpass query text; the compact file's exact layout.
- The grid index's cell size, and the heap implementation.
- How the 25 m entry points are produced (in SQL from the park shapes, or in the script).
- The walk line's style on the map (today's link-line style is the starting point) and the exact new wording, within "Frontend" above.
- How the "before" payloads and the comparison figures are produced (a script is fine; its outputs are not committed if they hold large data).
- Whether `fetch:streets` and the graph code share helpers with the parks fetch.

## Measured results

On 2026-11-21, all eight cities were fetched, built by street, calibrated and published on the local PostgreSQL 18.1 / PostGIS 3.6.2 stand-in (localhost:55432), seeded from the committed place files and the 2026-10-20 park files like Phase 1. Every write printed `localhost:55432`; every calibration read its 60 isochrones from the cache and made **no Mapbox requests**. "Before" is each city's production payload of 2026-11-06 (straight line), saved with a read-only GET. Production was switched on 2026-11-24 and 2026-11-26, matching these builds block for block (see "The production run" below).

### The networks and the build

| City | Ways | Nodes | File | Graph kept | Block joins: median / p95 / max | Blocks > 150 m (residents) | Build |
|---|---|---|---|---|---|---|---|
| Amsterdam | 122,762 | 478,049 | 14.7 MB | 96.9% | 27 / 224 / 695 m | 228 (3.46%) | 12.7 s |
| Berlin | 526,536 | 1,586,508 | 53.1 MB | 98.7% | 23 / 114 / 759 m | 241 (0.47%) | 48.6 s |
| London | 672,095 | 2,736,475 | 87.9 MB | 97.7% | 23 / 118 / 958 m | 460 (0.12%) | 60.3 s |
| Munich | 217,295 | 727,171 | 23.5 MB | 98.6% | 20 / 97 / 378 m | 38 (0.38%) | 19.2 s |
| New York | 573,174 | 1,927,249 | 66.4 MB | 96.4% | 25 / 87 / 1,283 m | 78 (0.19%) | 104.4 s |
| Paris | 236,557 | 819,771 | 25.8 MB | 97.6% | 18 / 65 / 201 m | 2 (0.01%) | 34.2 s |
| Sydney | 191,975 | 783,692 | 26.4 MB | 97.4% | 18 / 86 / 455 m | 1 (0.02%) | 25.8 s |
| Tokyo | 435,689 | 1,544,322 | 52.6 MB | 98.7% | 17 / 74 / 827 m | 139 (0.31%) | 34.3 s |

- **Fetching**, in 0.1° tiles with 5 s pauses, took about 2 hours for the last six cities back to back (Amsterdam 02:46 to London's save at 04:48); Sydney and Berlin were fetched separately earlier.
- **No block is unreached** for any need in any city.
- **The park need dominates each build** (Berlin 33 s of 48.6 s, New York 87 s of 104 s): `NodeIndex.nearest` for 27,000–177,000 entry points a city. Fine offline, and it does not lengthen a production gap: the build deletes and rebuilds the city inside one transaction that commits at the end, so visitors keep the old payload and cards until COMMIT. The visible gap runs from the build's COMMIT, through `reach:calibrate`, to the end of `reach:publish`. A finer grid or a squared-distance prefilter would still cut the build's time.
- **Amsterdam's far blocks** are mostly the Westpoort port: 112 of its 228, holding 27,566 of the 30,775 residents in far blocks, where GHSL's modelled grid puts residents on industrial land with no public streets (its most populated, 2,049 residents at 52.41554, 4.81218, is 311 m from the nearest walkable node). The street file has nodes in every 0.1° tile, so it isn't a fetch gap.

**Median detour** (street metres ÷ straight-line metres, per need):

| City | Supermarket | Pharmacy | Doctor | School | Park | Station |
|---|---|---|---|---|---|---|
| Amsterdam | 1.38 | 1.36 | 1.36 | 1.46 | 1.35 | 1.34 |
| Berlin | 1.39 | 1.32 | 1.34 | 1.45 | 1.32 | 1.30 |
| London | 1.38 | 1.35 | 1.39 | 1.55 | 1.35 | 1.35 |
| Munich | 1.39 | 1.34 | 1.36 | 1.44 | 1.34 | 1.32 |
| New York | 1.38 | 1.34 | 1.34 | 1.48 | 1.30 | 1.28 |
| Paris | 1.38 | 1.38 | 1.38 | 1.48 | 1.31 | 1.35 |
| Sydney | 1.41 | 1.39 | 1.44 | 1.47 | 1.34 | 1.32 |
| Tokyo | 1.41 | 1.38 | 1.37 | 1.50 | 1.29 | 1.31 |

Schools have the longest detour in every city.

### Calibration

Held-out agreement at k_fit (the fit half's pace). Each cell is the street figure with Phase 1's straight-line figure in brackets:

| City | k (range) | k_fit | 5 min | 10 min | 15 min | 20 min |
|---|---|---|---|---|---|---|
| Amsterdam | 95.5 (90–98) | 95.5 | 95.6% (93.3) | 98.3% (95.6) | 97.8% (98.9) | 99.4% (98.9) |
| Berlin | 92 (89–92.5) | 91.5 | 94.4% (87.8) | 97.2% (93.3) | 98.9% (94.4) | 98.9% (96.7) |
| London | 90.5 (90–97) | 90.5 | 92.2% (91.7) | 96.7% (94.4) | 100% (97.2) | 100% (98.9) |
| Munich | 90 (87.5–99) | 90 | 93.3% (91.7) | 96.1% (93.3) | 98.9% (97.8) | 98.9% (99.4) |
| New York | 94 (91–102) | 102 | 95.6% (90.6) | 97.8% (97.2) | 96.7% (95.6) | 98.9% (99.4) |
| Paris | 91 (90.5–101.5) | 91 | 95.6% (91.1) | 97.8% (99.4) | 99.4% (99.4) | 100% (100) |
| Sydney | 91.5 (88–103.5) | 91.5 | 90.0% (91.7) | 95.6% (95.6) | 100% (99.4) | 100% (100) |
| Tokyo | 90 (90–96) | 90.5 | 92.8% (85.0) | 97.2% (93.3) | 99.4% (97.8) | 100% (98.9) |

- **Base rates** (always answering "within"), 5 / 10 / 15 / 20 minutes: Amsterdam 55.0 / 80.0 / 87.2 / 90.0%; Berlin 44.4 / 79.4 / 90.6 / 97.8%; London 49.4 / 83.9 / 94.4 / 99.4%; Munich 49.4 / 83.9 / 91.7 / 95.0%; New York 46.7 / 81.1 / 91.7 / 95.6%; Paris 77.8 / 97.2 / 99.4 / 100%; Sydney 60.6 / 91.1 / 98.3 / 99.4%; Tokyo 53.9 / 86.1 / 95.6 / 97.8%.
- **Where agreement falls against Phase 1:** four places, each by 1–3 of 180 checks, all within chance: Amsterdam at 15 minutes (98.9% to 97.8%), Munich at 20 (99.4% to 98.9%), New York at 20 (99.4% to 98.9%) and Paris at 10 (99.4% to 97.8%). The base rate at them is 87–97%, so most places are within reach anyway.
- **Success criterion 1:** every city passes at all four limits.
- **Success criterion 2:** seven of eight beat their Phase 1 5-minute figure. **Sydney doesn't** (90.0% vs 91.7%): 18 of 180 checks wrong by street against 15 by straight line. Investigated with a read-only reconstruction that reproduces both figures exactly: 12 checks are wrong only by street, 9 only by straight line and 6 both (McNemar on the 21 discordant checks, p ≈ 0.66: within chance). Every street-only miss is "street says outside, Mapbox inside": places 185–418 m away in a straight line and 463–605 m by street (detours 1.29–2.74), just over the 457.5 m limit. The joins are small (sampled blocks' median 18 m, max 55 m); leaving out the block's join gives 90.6%, both joins 91.1%, so they explain about half. The rest is the isochrone's own margin: Mapbox's area reaches a little past the streets it covers, which matters most at 5 minutes, and one pace can't fit that at every limit. **The owner chose street distances for Sydney too** (2026-11-21), overriding the criterion's default of keeping the estimate.
- **The pace is 90–95.5 m of street a minute in every city** (about 5.4–5.7 km/h), above the 72–90 m this design expected from people's walking speeds. Eight cities agreeing this closely says the pace is mostly Mapbox's (with the isochrone's margin), not the cities'.
- **New York's fit half paced 102**, against 94 on all 60 blocks; its range (91–102) is the widest after Paris's and Sydney's.

### Joining a block to one node or several

Some walks start badly: a block whose nearest node is on a path that meets the streets only far away walks that path first. Starting each walk from the best node within R metres of the block's centre instead (nearest node always included, the join counted) would shorten many walks: in Paris 31% of POI block-needs by more than 10% and 50 m, and 10% by more than 25% and 100 m; in Berlin 20% and 5%. Scored against Mapbox on the calibration sample, it agrees **less**: on the held-out half at 5 minutes, every R scores below the nearest node except London's 150 m:

| City | Held-out 5 min: nearest | R 50 m | R 100 m | R 150 m |
|---|---|---|---|---|
| Paris | 95.6% | 94.4% | 92.8% | 90.6% |
| Berlin | 94.4% | 92.8% | 93.3% | 92.2% |
| London | 92.2% | 87.8% | 90.0% | 93.3% |

Graded both ways (each half fitted and graded on the other, 360 checks a limit), "nearest" is ahead of every R at 5 minutes in all three cities and at 10 and 15 minutes in Paris and Berlin. The build keeps the single nearest node: picking the best start flatters every block more than it rescues the few cut off.

### Before and after

| City | Headline, 15 min (range) before | after | Residents whose block changes colour at 5 / 10 / 15 min | Compressed payload before → after |
|---|---|---|---|---|
| Amsterdam | 74.1% (69.1–74.5) | 74.8% (72.1–75.5) | 11.9 / 8.7 / 5.3% | 82,481 → 83,315 B (+1.0%) |
| Berlin | 67.4% (62.4–71.7) | 72.1% (70.1–72.4) | 11.6 / 13.5 / 11.8% | 291,604 → 294,290 B (+0.9%) |
| London | 68.8% (59.8–72.9) | 68.7% (68.3–74.1) | 7.0 / 16.9 / 11.2% | 583,023 → 591,243 B (+1.4%) |
| Munich | 81.0% (77.9–84.6) | 83.8% (82.6–88.4) | 12.7 / 13.5 / 8.4% | 97,535 → 98,430 B (+0.9%) |
| New York | 72.9% (71.3–77.7) | 75.5% (73.8–79.1) | 11.4 / 12.0 / 7.6% | 238,794 → 242,182 B (+1.4%) |
| Paris | 99.4% (99.1–99.6) | 99.7% (99.7–99.8) | 24.2 / 3.2 / 0.5% | 40,123 → 39,896 B (−0.6%) |
| Sydney | 93.1% (90.4–95.7) | 94.6% (94.5–96.9) | 23.2 / 12.4 / 4.0% | 8,387 → 8,401 B (+0.2%) |
| Tokyo | 81.3% (79.7–88.6) | 85.6% (85.6–88.4) | 10.5 / 15.5 / 7.5% | 228,475 → 228,928 B (+0.2%) |

- Every block matched between before and after in every city (none only in one).
- **Payload (criterion 4):** the same properties per block; every city within 2% compressed. "Before" is Brotli quality 11 of the saved JSON, as `reach:publish` compresses.
- **Storage (criterion 5):** the walks take 78 MB (`pg_column_size`): Amsterdam 6.6, Berlin 14, London 33, Munich 4.8, New York 9.4, Paris 1.5, Sydney 0.3, Tokyo 9.1 MB; about 300 B a walk over 254,550 walks, inside the 120 MB budget. Locally `reach_nearest` is 113 MB with its indexes. Neon's change history will also hold the rewritten rows for a while.
- **Block cards** (Berlin, ten blocks, a throwaway API on the local database): 1,522–3,947 B, typically 2.0–2.3 KB, and 9,443 B for the block with the most walk points (`891f1d59e6bffff`); production's straight-line cards are 793–829 B. The card route doesn't compress.

### Where it breaks

- **The three Phase 2 blocks, by street** (the straight-line lists reproduced exactly by the same reconstruction): Tokyo `892f5aadb8fffff` 7 wrong → 0; Munich `891f8d4e977ffff` 5 → 1 (the doctor at 928 m, which Mapbox reached within 10); Berlin `891f1d482b7ffff` 5 → 2 (the Westend pharmacy at 856 m counted within 10, and a school at 1,796 m within 20; Mapbox reached neither in time). By street, Berlin's nearest park is Klausenerplatz (1,482 m), not Schlosspark Charlottenburg.
- **The new worst held-out blocks** have 3 of 24 wrong: Amsterdam `89196952e07ffff`; London `89194e68a03ffff`; Munich `891f8d46bdbffff`; New York `892a1061dabffff`, `892a1076083ffff`; Paris `891fb46296fffff`, `891fb46708fffff`; Sydney `89be0e343abffff`, `89be0e35d87ffff`, `89be0e35dbbffff`.
- **The README tells two:** Paris `891fb46296fffff`, whose nearest node is on a pedestrian area by the Seine mapped as an outline (`highway=pedestrian`, `area=yes`, way 790342887), so every walk follows the outline about 400 m before meeting a street; and Paris `891fb46708fffff`, whose nearest park by street is Jardin Atlantique over Gare Montparnasse, reached along a footway mapped at its level (`layer=2`, `level=2`, way 1159681278), which Mapbox's walks never reached. Share links at `t` 10, encoded with the app's codec and decoded back to the same state.
- **New York `892a1076083ffff`** is a grading artefact: its three misses are at the fit half's 102 m a minute, and at the published 94 all three come out right.
- **Two outliers outside the sample show the single-node join at its worst**, both thinly populated: Berlin `891f1d4b3bbffff` (236 residents, in Spandau between the Spree and the railway), whose walks run 2.7–3.8 km, and `891f18b4ec7ffff` (81 residents, beside the Müggelsee forest), 2.7–4.1 km.

### Browser checks (2026-11-22)

Run in the built-in Chromium browser against the owner's dev servers, the backend reading the local stand-in, after the final review's fix wave (which moved the pins to the walk's end).

- **The self-heal (criterion 3).** The browser first loaded Berlin's straight-line payload of 2026-11-06 while the backend still read production, then the backend was switched to the street build. The browser pane closed in between, and the reopened page took the straight-line payload from the browser's HTTP cache (`max-age` one day), which is the case a returning visitor meets after the switch. Clicking `891f1d482b7ffff` made one card request; its metres didn't match the cached payload, so the page made exactly one `cache: 'reload'` pair (payload and card) and no more requests. The panel then read the street build (pace 89–92.5 m a minute "along streets") and the card its street figures (Aldi ~3 min, Westend station ~12, Klausenerplatz ~17 as the nearest park), with no reload.
- **Walks and pins.** At 15 minutes, four walks and four pins for the four needs within reach; at 20 minutes, six. Projected from the map's centre and zoom, every pin sits within 1 px of its walk's last point, and the walk's second point is 59 px from any pin. The park's walk ends 0.15 m from Klausenerplatz's edge.
- **Wording.** The method note reads "follows streets and footpaths … at 92 metres a minute", the sources list "Streets: © OpenStreetMap contributors, fetched 21 Nov 2026", and the limits read "Distances are measured along streets and paths from each block's centre."
- **The three Phase 2 blocks by eye.** Berlin as above. Tokyo `892f5aadb8fffff` at 5 minutes: pharmacy and doctor ✓ at ~5 min, supermarket, school, park and station ✗, two pins. Munich `891f8d4e977ffff` at 10 minutes: school and park ✓ at ~10 min, the walks bending along Forstenried's streets, two pins.
- **No console errors** on any page.

### The production run (plan Task 13, 2026-11-23 to 2026-11-26)

Each stage ran with the owner's go-ahead, writing through `.env.production-direct` (Neon's direct, non-pooler host, printed before every write).

1. **Rollback point:** the owner made the Neon branch `pre-street-2026-11-23` from production, with 1.07 GB of storage free.
2. **Migration 005** (2026-11-23, run by the owner), before the merge. A read-only check found `walk` as `LINESTRING` in SRID 4326, the check constraint validated, all 254,550 rows still `estimate`, and the database at 171 MB. The live card answered as before.
3. **The merge and deploys:** PR 22 was merged (with a merge of main for the cleanup PR 21). Render then served cards with a `walk` field and Vercel a bundle with the street wording. The live site still read the straight-line build correctly.
4. **Sydney first** (2026-11-24, 22:51 UTC), as a trial. A browser on the live site loaded Sydney's straight-line payload before the switch. After it, clicking a block made one card request, then exactly one `cache: 'reload'` pair; the panel read the street build with no reload and no console errors.
5. **The other seven** (2026-11-26, 00:33–00:44 UTC), back to back, a runner stopping at the first failure or mismatch.

| City | Gap (build commit → publish) | Blocks identical to the local build |
|---|---|---|
| Sydney | 18 s | 200 / 200 |
| Paris | 19 s | 1,089 / 1,089 |
| Amsterdam | 20 s | 2,216 / 2,216 |
| Munich | 21 s | 2,607 / 2,607 |
| Tokyo | 24 s | 6,252 / 6,252 |
| New York | 25 s | 6,354 / 6,354 |
| Berlin | 26 s | 7,869 / 7,869 |
| London | 51 s (with the GP check) | 15,838 / 15,838 |

- **Matching the local build:** every payload equals the local run's block for block, its metadata differing only in `builtAt` and `sources.calibratedAt`.
- **Calibration** made 0 Mapbox requests, and reproduced every city's pace and agreement.
- **London's GP check** reproduced 807 of 1,142 practices (70.7%).
- **The deployed API passed 99 of 99 checks.** Each city's payload has the street method, the right block count, Brotli and a `304` on its ETag. A mid-city block's card has six walks ending at their places, with metres and pace equal to the payload's. A malformed cell gets `400`, and an unknown cell or city `404`.
- **The database grew from 171 MB to 272 MB** (walks 78 MB): every one of the 254,550 rows is a `network` row with a walk.

### Follow-ups found while measuring

- **Pedestrian areas** (`highway=pedestrian` with `area=yes`: squares, quays, station forecourts) are walked round their outline, never across. Connecting each such area's nodes to each other would fix the Seine block and similar squares.
- **The park need's node lookups** dominate the build time (above).
- **Not counting the block's join** (Mapbox starts its walks on a road) helps a little at 5 minutes in Sydney (90.0 → 90.6%); not tried elsewhere.
