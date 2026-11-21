# Everyday Reach by Street — Design

**Date:** 2026-11-21
**Status:** Approach, scope and switch-over chosen by the owner in conversation; this written design awaits the owner's review
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
- **Keep each city's gap short (owner's choice, 2026-11-21).** The layer is live, and `reach:build` deletes the city's payload, so the city shows "Not built for this city yet" until `reach:publish` (an estimated few minutes per city, longer for London). Run the switch at a quiet hour, one city straight after another. The owner's go-ahead for a city covers its build, calibrate, GP check and publish together, so the gap is never held open waiting for the next go-ahead. Record each city's gap in the run notes.
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
