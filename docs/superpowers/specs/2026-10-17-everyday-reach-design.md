# Everyday Reach — Design

**Date:** 2026-10-17
**Status:** Approved in conversation, section by section; awaiting review of this written spec
**Branches:** `reach/data-and-api` → `reach/interface`, merged in that order
**Prerequisites:** `chore/keep-warm` and `fix/district-outlines` merged to `main` first (migration 003 is already applied to production), and `reach/data-and-api` brought up to date with `main` before Phase 1 starts.

## Problem

CityScope's question is "how dense, and how reachable, is a city?", but every tool answers it for one point at a time: a walking-time area from one origin, the 300 m spotlight around one click, one district, one drawn shape. Nothing answers it for a whole city, and nothing gives a visitor a single number to remember.

The owner is job-hunting for mapping, property, logistics and urban-tech roles. The feature that best shows those skills is one that turns the existing data and PostGIS work into a city-wide answer with a measured, honestly stated error, not another single-point tool.

## Goals

1. **A city-wide answer.** For every block where people live, the estimated walking time to the nearest of six everyday needs.
2. **A headline about people.** "61% of residents live within 15 minutes' walk of all six", with a range that shows the calibration uncertainty. (Figures in this document are placeholders until measured.)
3. **Interactive without waiting.** Choosing needs and a time limit recolours the map and updates the headline in the browser, with no server call. Clicking a block shows its nearest places.
4. **Honest by construction.** The method, its measured agreement with real street routing, the data's completeness and its known limits are published in the app and the README.
5. **Interview depth.** An H3 hexagon grid, set-based nearest-neighbour queries on a geography index, precomputation, calibration against Mapbox with a held-out half, and a bootstrapped range.

## Non-goals

- **Street-network walking distances** (multi-source Dijkstra). Planned as a later replacement; the storage is shaped so it can drop in without touching the API or the map.
- Bus stops (a stop says nothing about how often a bus comes), opening hours, cycling.
- **Ranking the cities against each other.** Their district sets cover very different areas (below).
- Tokyo outside the 23 wards. Sydney beyond the 33 inner suburbs the database holds.
- Census population. GHSL is a modelled grid and is described as "estimated residents".
- The "Sun and shade" idea and three.js. Parked; Mapbox GL 3 already draws 3D natively.

## Decisions made during design

| Question | Decision | Why |
|---|---|---|
| Which needs | Supermarket, pharmacy, doctor, school, park, station | How planners define the 15-minute city; the current 11 categories are mostly leisure |
| What the headline measures | People, from GHSL GHS-POP R2023A, 2025 epoch | "Of residents" is the honest claim; one global method, so every city is measured the same way |
| How walking time is estimated | Straight-line distance ÷ a per-city "straight-line metres per walking minute", calibrated against Mapbox walking isochrones | Ships about a week sooner than a street network; the error is measured and published |
| Tokyo | The 23 wards | The rest of Tokyo Metropolis has no place data; "Tokyo" in city comparisons usually means the wards |
| Comparing cities | No ranking; each city's headline is labelled with what it covers | Paris's 105 km² core is not comparable with all 1,595 km² of London |
| Groceries | Supermarkets only | Defensible; London's undercount (small supermarkets tagged as convenience stores) is measured and stated |
| Name | "Everyday reach" | "15-minute city" carries political baggage in the UK; the idea is explained inside the feature |
| The honesty bar | 80% agreement on a held-out half of the calibration sample | No standard exists; this one is published alongside the results |
| The range | Bootstrapped calibration (200 resamples, 5th–95th percentile) | Derived from the data rather than an arbitrary ±10% |
| Delivery to the browser | One GeoJSON per city, built ahead of time, compressed once at maximum strength, served with its stored version tag | Measured below; avoids a 534 KB H3 library in the page |
| The block card | Describes the block's stored nearest places, not the click point | A click can land 200 m from the block's centre; card and colour must agree |

## Measured facts this design rests on (2026-10-16/17)

All read-only, against production data or public services.

- **District coverage differs.** Paris 105 km² (20 arrondissements), London 1,595 km² (33 boroughs), Berlin 891, New York 782, Munich 286.5, Amsterdam 241, Sydney 26.5 (33 inner suburbs), Tokyo 2,175 km² for all of Tokyo Metropolis including the Tama cities and Pacific islands.
- **Place data stops short of the outlines.** Tokyo: 34 of 63 districts (1,532 km²) have no place data; places were fetched for the 23-ward box only. Amsterdam: 30 km² of districts lie outside its fetch box. Berlin's and London's boxes hug the city limit, so blocks at the edge lose places just across it.
- **District outlines were invalid** (65 of 202). Fixed by migration 003, applied to production on 2026-10-16: 0 invalid, 200 districts, Munich 275.0 → 286.5 km².
- **OpenStreetMap counts inside each fetch box** (Overpass, 2026-10-16):

  | | Supermarket | Pharmacy | Doctors + clinics | School | Station + halt | Tram stop | Metro entrance | Convenience |
  |---|---|---|---|---|---|---|---|---|
  | Berlin | 1,582 | 770 | 2,039 | 1,253 | 400 | 968 | 708 | 1,176 |
  | London | 1,419 | 1,432 | 1,629 | 3,797 | 700 | 70 | 600 | 6,060 |
  | Tokyo (23 wards) | 2,446 | 3,018 | 2,960 | 2,549 | 734 | 59 | 1,508 | 6,375 |

  Tags under `healthcare=*` without the matching `amenity=*` add at most 132 (London doctors).
- **H3 resolution 9 over the real outlines:** London 16,875 cells, Berlin 9,462, Tokyo's 23 wards 6,274, Paris 1,109. All cells have six corners. Across about 200,000 shared corners, rounding coordinates to 5 decimals gave **0 mismatches**, so no seams. The farthest corner is 197–202 m from a cell's centre.
- **Payload, every cell in the outline, as GeoJSON:** London 5.2 MB raw, about 950 KB compressed on the fly, **538 KB** compressed once with Brotli at quality 11. Berlin 319 KB, Tokyo 213 KB, Paris 37 KB at quality 11.
- **Headline maths for London:** 3.5 ms per recalculation with objects, **0.18 ms** with typed arrays (desktop).
- **Contrast on the map's land colour `#101113`:** a 7-step cyan ramp gives neighbouring steps of about 1.3:1; three classes give 2.1:1 and 2.7:1. Gold against cyan is 1.03:1; a gold outline on a full-cyan cell is 1.37:1.
- **The live API** already sends weak ETags and answers 304 through Render's edge. It sends no `Cache-Control`. Render compresses responses (Berlin `/pois`: 2.07 MB raw, 441 KB delivered).
- **Mapbox isochrones:** four bands per request, 0.77 s. By default they are simplified (the 5-minute area had 10 points; with `generalize=0`, 71). The public token works from a script with no Referer, so it is not restricted to the site.
- **GHSL** publishes the 2025 grid in latitude and longitude at 3 arcseconds (`GHS_POP_E2025_GLOBE_R2023A_4326_3ss`), in 348 tiles of 7.8–144 MB each. The single-file version is 12.9 GB.
- **The database** is 67 MB.

## Phase 1 — Data and API (`reach/data-and-api`)

### Needs and categories (`cityscope-backend/src/lib/poiCategories.ts`, new `src/lib/needs.ts`)

New tagging rules, each an exact whole-token match like the existing ones:

- `amenity=pharmacy`, and `healthcare=pharmacy` without it;
- `amenity=doctors|clinic`, and `healthcare=doctor|clinic` without them;
- `amenity=school`;
- `railway=station|halt|tram_stop|subway_entrance`.

Categories stay plain OSM values. A separate need mapping sits on top:

| Need | Short key | Categories |
|---|---|---|
| Supermarket | `sm` | `supermarket` |
| Pharmacy | `ph` | `pharmacy` |
| Doctor | `dr` | `doctors`, `doctor`, `clinic` |
| School | `sc` | `school` |
| Park | `pk` | parks of at least 0.5 ha, measured to their edge (below) |
| Station | `st` | `station`, `halt`, `tram_stop`, `subway_entrance` |

**Measurement-only categories.** `tram_stop` and `subway_entrance` exist to measure the station need. They never appear in place lists, district statistics or area results, which they would flood.

**The heatmap keeps the original 11 categories.** Otherwise both its meaning and its per-city brightness tuning would shift.

### Parks as shapes

Parks are fetched with their geometry (`out geom`) into a new `parks` table: `city_id`, OSM id, name, `geom` MultiPolygon, and area in m². Many large parks are multipolygon relations, whose rings have to be assembled from their member ways. Use `osmtogeojson` for that, not hand-written ring assembly, and repair the result with `ST_MakeValid` on insert, as migration 003 does for districts. The park need only counts parks of **at least 0.5 ha**, the size in the WHO Europe benchmark of green space within 300 m of home. It measures to the park's **nearest edge**. The existing park points stay, for the features that use them.

### The fetch box

Each city is fetched over its district outline's extent plus a **2 km margin** on every side. For Tokyo the outline is the 23 wards: the districts whose names end in " Ku", which is 23 rows, checked on 2026-10-17. The same outline defines Tokyo's cells. Fifteen minutes on foot is roughly 1.2 km in a straight line, so this covers places just across the boundary. The existing `cities.bounds` stays as it is for framing the map. District statistics count by `ST_Contains`, so places in the margin don't change them.

### The reload

- Overpass is called one city at a time with cooldowns, using the pipeline's `User-Agent`, retrying on 429 and 502.
- Production is reloaded city by city, each in one transaction, **only after the owner's go-ahead**. Counts per category are reported before and after.
- The **frontend changes land first**, on the same branch: icons and labels for the new categories, the heatmap filter, and measurement-only categories hidden from lists.

### Population (GHSL)

- **Source:** GHS-POP R2023A, epoch 2025, the `4326_3ss` tiles. The owner approves each download, named with its size. Tiles are unzipped outside the repository and never committed.
- **`aggregate-population.ts`:**
  - reads only the window covering each city's outline, using `geotiff`;
  - keeps pixels whose centre is inside the outline;
  - adds each pixel's value to the H3 res-9 cell containing that centre;
  - checks that the cell totals equal the window total (replaced while building: see "Amendments", Population).
- **Credit:** "GHSL, European Commission JRC", under CC BY 4.0, cited in the README and in the map attribution while the layer is on.

### Grid and nearest places (migration 004, `build-reach.ts`)

**Migration 004** adds:

- a geography index on `pois`: `GIST ((geom::geography))`;
- the `parks` table, with a geography index;
- `reach_cells`: `city_id`, `h3`, `residents`, `outline` Polygon, `centre` Point; primary key `(city_id, h3)`;
- `reach_nearest`: `city_id`, `h3`, `need`, `place_kind` (`poi` or `park`), `place_id`, `metres`, `method`;
- `reach_calibration`: `city_id`, `method`, `metres_per_minute`, `k_low`, `k_high`, `agreement` by band, `sample_size`, `computed_at`;
- `reach_payloads`: `city_id`, `body` (Brotli bytes), `etag`, `built_at`.

**`build-reach.ts`** does the following, one transaction per city, and is safe to rerun:

1. **Cells.** Keep a cell if it holds at least one estimated resident (rounded) and lies inside the outline.
2. **Nearest places.** For every cell and need, find the nearest place with one set-based statement per city: `CROSS JOIN LATERAL … ORDER BY geog <-> centre LIMIT 1` on the geography index. Parks are measured to their edge. Never one query per cell; 240,000 round trips would take hours.
3. **Payload.** Write the compressed payload once calibration exists.

**Rule:** `build-reach` reruns after every place reload, because place ids change on reload. The README and `CLAUDE.md` say so.

### Calibration (`calibrate-reach.ts`)

1. **Sample.** 60 cells per city, drawn in proportion to residents with a fixed seed, split into two halves of 30.
2. **Ground truth.** One Mapbox walking request per sample cell, from its centre, with `contours_minutes=5,10,15,20` and `generalize=0`. For each need, record whether the stored nearest place lies inside each band.
3. **Fit.** On the first half, find the straight-line metres per minute `k` that maximises agreement between `metres / k ≤ T` and the ground truth. Agreement is pooled over all four bands and six needs.
4. **Report.** Agreement for each band on the **held-out half**.
5. **The bar**, applied per city.
   - A time stop appears on that city's slider only if its held-out agreement is at least **80%**.
   - The city gets the layer only if its 15-minute agreement passes the same bar.
6. **Range.** Refit `k` on 200 bootstrap resamples of the full 60-cell sample. `k_low` and `k_high` are the 5th and 95th percentiles.
7. **Where it breaks.** List the cells with the largest misses. Two or three go in the README with screenshots.
8. **Credentials.** A **script-only Mapbox token** in the backend `.env`. Calibration uses about 500 requests per full run, well under the rate limit of 300 per minute.

### Data checks (published in the method note and README)

- Places per 100,000 residents, per need, per city.
- **London doctors:** the share of NHS England GP practices (the ODS practice list, located by postcode through postcodes.io) with an OSM doctor or clinic within 150 m.
- Category counts before and after the reload.

### API

**`GET /api/cities/:cityId/reach`**

- Sends the stored Brotli body with `Content-Encoding: br`, `ETag`, `Cache-Control: public, max-age=86400` and `Vary: Accept-Encoding`.
- Answers `304` to a matching `If-None-Match` without reading the body.
- Decompresses for a client that doesn't accept Brotli.
- Returns `404 {"error":"No reach data for this city"}` when there is no payload, and also when the reach tables do not exist yet (Postgres `42P01`, before migration 004), as the card route does.
- Sets its `ETag`, `Cache-Control` and `Vary` only once the bytes to send are ready, so a failed decompression is a plain 500; `Vary: Accept-Encoding` is added to the CORS `Vary: Origin`, not put in its place.
- After deploy, check that Render and Cloudflare pass the pre-compressed body through untouched.

**Payload shape:** a GeoJSON FeatureCollection with a `meta` member, which GeoJSON allows and Mapbox ignores.

- `meta` holds:
  - the city and its coverage label, for example "Tokyo · the 23 wards";
  - total residents;
  - `method: "estimate"`, `metresPerMinute`, `kLow`, `kHigh`;
  - agreement by band, and the stops that passed;
  - sample size;
  - the needs, with id, label and categories;
  - `builtAt`;
  - source dates and completeness figures.
- Each feature is one cell:
  - its outline, with coordinates to 5 decimals;
  - flat integer properties: `h` (the H3 id), `r` (residents), and straight-line metres for `sm`, `ph`, `dr`, `sc`, `pk` and `st`.
  - Properties are single numbers because Mapbox turns nested values into strings its expressions can't read.
- The browser derives minutes as `metres / k`. Carrying metres plus the `k` values is what lets the range be recalculated for any choice of needs and time.

**`GET /api/cities/:cityId/reach/:cellId`**

- Checks that `cellId` is a 15-character hexadecimal H3 id.
- Returns the cell's residents and, for each need, the stored nearest place: name, category, coordinates, metres and minutes. Minutes are `Math.ceil(metres / k)`, rounded up: the map counts a place as within T minutes when `metres / k ≤ T`, and for a whole number T that holds exactly when the rounded-up minutes are at most T, so the card never contradicts the colour.
- Returns `404` for an unknown cell.

### Phase 1 tests (Vitest, pure logic)

- **Tagging rules:** new tags, the `healthcare=*` variants, and that measurement-only categories are excluded from display lists.
- **The 0.5 ha park filter.**
- **Population aggregation:** pixel-centre assignment, inside-outline filtering, and totals preserved.
- **Calibration:**
  - the fit recovers a known `k` from made-up data;
  - the held-out split and the bootstrap give the same result on every run.
- **Payload builder:** the shape, short keys, 5-decimal rounding, `meta`, the Brotli round trip, and a stable ETag.
- **Route input checks** for city ids and cell ids.

### Phase 1 is done when

- Both endpoints answer for all 8 cities, checked with `curl`. A city that fails the bar answers with `meta` saying so. (Phase 1 checked this in-process against the local stand-in database; after the production load on 2026-11-06 the same checks passed against the deployed API, 71 of 71.)
- The agreement table, data checks and payload sizes are measured and recorded. London's target is **450 KB or less** compressed (not met in Phase 1; see "Measured results").
- The backend tests, type check and frontend suite pass.

## Amendments while building Phase 1

Decisions made while building `reach/data-and-api`. Where one of them differs from the text above, this section wins.

### Places and categories

- **`healthcare=doctor` is stored as `doctors`.** The spec's need table listed `doctors`, `doctor` and `clinic`; storing both spellings would show two "Doctor" rows in every category list. The `dr` need therefore covers `doctors` and `clinic`.
- **The 300 m heatmap spotlight lists all 17 displayed categories** (the 19 minus tram stops and metro entrances), including pharmacies, schools and stations. Only the heatmap itself stays on the original 11, because a nearby pharmacy or station is useful in a "what's within 300 m" card and the heatmap's meaning and brightness tuning are what needed protecting.
- **`NONE_FOUND_METRES` (65535) marks a need with no place in a city's data.** Properties have to be plain numbers for Mapbox expressions, so a missing place is written as 65535 m, which lies outside every walking band, rather than left out. Real distances are capped at 65534 so they can never be mistaken for it.

### Fetching

- **Fetch boxes are the union of each city's old bounds and its district outline plus 2 km.** The outline plus a margin alone would shrink some downloads: Sydney's old box is much wider than its 33 districts, and its heatmap would have lost coverage. With the union, no city's download shrinks.
- **`osmtogeojson` assembled multipolygon parks from Overpass `out geom` directly.** No query change was needed, such as a second pass to fetch member ways.
- **A partial or empty fetch never replaces a city.** Overpass sometimes answers 200 with a "runtime error" remark and only part of the data. The fetcher retries that, and a dropped connection, with the same doubling waits as a 429 or 502. `seed:pois` and `seed:parks` also refuse an input with no places before they connect.
- **Each fetch records when it ran, beside the file it wrote.** `fetch:pois` writes `src/scripts/pois-data-<city>.source.json` (committed, like the places file) and `fetch:parks` writes `data/parks-<city>.source.json` (git-ignored, like the parks file), each `{ "fetchedAt": …, "osmBase": … }`, where `osmBase` is Overpass's `osm3s.timestamp_osm_base`, the OSM database state it answered from. `reach:publish` puts them into `meta.sources` as `placesFetchedAt`, `osmBase`, `parksFetchedAt` and `parksOsmBase`, with `calibratedAt` from `reach_calibration.computed_at`; a missing record is null. The files fetched on 2026-10-20 predate this, so their records give only the date and `osmBase: null`, rather than an invented time. `meta.needs` lists each need's `source` (`pois` or `parks`) and `categories` (empty for parks).

### Population

- **A pixel counts towards the H3 cell its centre falls in, and only cells whose centres lie inside the outline are kept.** This gives the cells the outline covers without a point-in-polygon test for every pixel.
- **Outline pieces with no area are skipped.** New York's outline is the union of its five boroughs, 312 polygons, and two of them are four-point slivers whose corners differ only by floating-point noise. H3's `polygonToCells` throws on those, so `cellsForOutline` skips any polygon enclosing less than 1e-12 square degrees (about 0.01 m²), and any polygon with no rings. The area is measured from the ring's first corner: summed at full coordinates, rounding alone reaches about 1e-12 (a straight-line sliver in Sydney measured 1.36e-12), the size of the threshold. A shape with no area holds no cell centre, so the guard changes no city's cells; all eight dry runs give the same cells after the change.
- **The "cell totals equal the window total" check is replaced by a unit test.** Under the cell-centre rule, a window's pixels whose cell is not in the outline are dropped by design, so the cell totals are less than the window total and the equality cannot hold. What it was meant to catch, pixels lost or counted twice where two GHSL tiles meet, is covered by the two-tile seam test in `population.test.ts` ("two adjacent tiles add into one map without double counting"), alongside the tests of pixel-centre assignment and of the cells allowed.
- **GHSL tile numbering follows the files' georeferencing.** Tile rows and columns are anchored at 89.0996° N and 180.0079° W, not at round 10° lines, so a tile edge sits 0.9004° south of a round latitude. The nominal formula would pick the wrong tile for a box just south of one.

### Calibration and publishing

- **The 60 sampled cells are split by alternation, not first and last 30.** The sampler returns cells in descending-key order, which favours the more populous cells at the front, so a first/last split would give the fit half the heavier cells. Alternating (fit, held out, fit, …) makes both halves span the same range of population.
- **The published `k` is fitted on all 60 cells; held-out agreement is measured at the fit-half `k`.** The agreement figures are therefore from a slightly different fit than the published `k`, and the method note must say so (Phase 2).
- **The bootstrap range is widened to include the published `k` if it falls outside.** A `k` fitted on 60 cells can land just outside the 5th to 95th percentile of 200 refits, and a headline must always sit inside its own range.
- **Publishing is its own script.** `reach:publish` builds and stores the payload, instead of `reach:build` doing it once calibration exists. `reach:build` clears the city's calibration and payload, and `reach:calibrate` clears its payload, so the order is always build, calibrate, publish.
- **A reload clears the city's reach data.** `seed:pois` and `seed:parks` delete the city's `reach_payloads`, `reach_calibration` and `reach_cells` rows (and with the cells, `reach_nearest`) inside the reload's transaction whenever the reach tables exist, and print that reach must be rebuilt. The rebuild rule above is then enforced rather than only documented: no card or payload can outlive the places it describes.
- **`reach:build --dry-run` runs in a read-only transaction and writes nothing.** It counts the city's residents so the outline and population path can be checked on real data, even against production, with no risk.

### Data checks

- **`reach:check-gp` exists, and it covers London only.** It reads NHS England's ODS practice list from `cityscope-backend/data/nhs/epraccur.csv` (git-ignored), locates each active GP practice by postcode through postcodes.io, and stores the share of London's practices with an OSM doctor or clinic place within 150 m in London's `reach_calibration.checks` (`londonGpShare`, `londonGpPractices`). `reach:publish` copies it into the payload's `meta.completeness.checks`. A recalibration keeps it, but `reach:build` deletes the calibration row with it, so after a London rebuild the order is build, calibrate, `reach:check-gp`, publish. It writes to the database, so it needs `CITYSCOPE_DB_TARGET` like the other writing scripts. The figures are under "Measured results".

### Safety

- **Writing scripts refuse to run unless `CITYSCOPE_DB_TARGET` holds a non-empty label, and they print it with the database host.** The aim is that a run against production is never a silent accident. The label is typed by whoever runs the script, and nothing compares it with `DATABASE_URL`, so it does not verify the target: the printed host (`Writing to <label> (<host>)`) is what to read. The guard covers `migrate`, `seed-pois`, `seed-parks`, `build-reach` (except `--dry-run`), `calibrate-reach`, `publish-reach`, `check-gp-coverage`, and `seed:all` and `seed-cities` too. `seed.ts` follows once `fix/district-outlines`, which rewrites it, is merged.
- **Where the label lives.** Local development may keep `CITYSCOPE_DB_TARGET=local` in `.env`, but only while that file's `DATABASE_URL` really is a local database. Any other target (`reach-dev`, `production`) is set on the command line for that run only and kept out of `.env`.

### The local stand-in database

Phase 1 was built and checked against a throwaway local PostgreSQL 18.1 / PostGIS 3.6.2 cluster (localhost:55432), standing in for the planned `reach-dev` Neon branch. The owner chose this. It was reached with `DOTENV_CONFIG_PATH=.env.local-pg` and `CITYSCOPE_DB_TARGET=local-pg`. Neither production nor a Neon branch was written to during Phase 1. **Production was loaded on 2026-11-06**, after the merge, through the production runbook in the plan, each stage with the owner's go-ahead. It used the same inputs (the committed place files, the 2026-10-20 park files and the cached Mapbox isochrones, so no Mapbox requests), and every city's stored payload matched the local run block for block, with only `builtAt` and `sources.calibratedAt` differing. London's GP check reproduced 0.707 of 1,142 practices.

### Measured results

Measured on 2026-10-20 on `reach/data-and-api`: all eight cities were fetched, seeded, built, calibrated and published in one sequence on the local stand-in database above, then both endpoints were checked in-process against it. After the final review, the same day, calibration and publishing were rerun for all eight cities on the unchanged cells: Mapbox's 480 answers, now cached on disk, gave identical `k`, ranges and agreement, and the base rates below come from that rerun. **Every city passes the 80% bar at all four time limits, but at 15 and 20 minutes that says little (see "Base rates").**

Agreement is the share of the 180 checks per limit (30 held-out cells × 6 needs) where the estimate agrees with Mapbox's walking isochrone. It is graded at the fit half's `k` (Amsterdam 67.5, Berlin 57.5, London 67, Munich 64.5, New York 67.5, Paris 65.5, Sydney 69.5, Tokyo 63.5 m/min), **not at the published `k`**, which is fitted on all 60 sampled cells: the agreement figures describe a slightly different fit from the `k` each payload carries. No city's bootstrap range had to be widened. Residents are GHSL estimates (2025 epoch). KB in this section means 1,000 bytes.

| City | Populated cells | Est. residents | k, m/min (range) | 5 min | 10 min | 15 min | 20 min | Stops passed | Passes | Payload, Brotli |
|---|---|---|---|---|---|---|---|---|---|---|
| Amsterdam | 2,216 | 888,663 | 69.5 (62–70.5) | 93.3% | 95.6% | 98.9% | 98.9% | 5, 10, 15, 20 | yes | 82,486 B |
| Berlin | 7,869 | 3,624,966 | 62.5 (57–68) | 87.8% | 93.3% | 94.4% | 96.7% | 5, 10, 15, 20 | yes | 291,630 B |
| London | 15,838 | 9,779,311 | 66.5 (59.5–70) | 91.7% | 94.4% | 97.2% | 98.9% | 5, 10, 15, 20 | yes | 583,036 B |
| Munich | 2,607 | 1,533,885 | 65 (61–69) | 91.7% | 93.3% | 97.8% | 99.4% | 5, 10, 15, 20 | yes | 97,477 B |
| New York | 6,354 | 8,416,530 | 69 (67–77) | 90.6% | 97.2% | 95.6% | 99.4% | 5, 10, 15, 20 | yes | 238,855 B |
| Paris | 1,089 | 2,250,792 | 68.5 (65–73.5) | 91.1% | 99.4% | 99.4% | 100.0% | 5, 10, 15, 20 | yes | 40,124 B |
| Sydney | 200 | 282,756 | 69.5 (59.5–73.5) | 91.7% | 95.6% | 99.4% | 100.0% | 5, 10, 15, 20 | yes | 8,375 B |
| Tokyo | 6,252 | 9,059,277 | 65 (63.5–75) | 85.0% | 93.3% | 97.8% | 98.9% | 5, 10, 15, 20 | yes | 228,699 B |

- The lowest single figure is Tokyo's 5-minute limit (85.0%), then Berlin's (87.8%). The 5-minute limit has the lowest agreement in every city.
- Payload sizes are from the rerun, whose `meta` also carries the base rates, the source dates and each need's categories; each is within 1 KB of the first publish. London's is the one published after `reach:check-gp` was rerun. Sydney's is from a last end-to-end check, which reseeded its places and parks, rebuilt it and recalibrated it from the cache with no Mapbox requests: every figure came out the same, and the payload's raw JSON was the same length (65,289 B). The compressed size moves by tens to hundreds of bytes whenever the timestamps in `meta` change.
- The headline (the share of residents within a limit of all six needs) is not computed in Phase 1. It runs in the browser in Phase 2, so no headline figure is stated yet.

**Base rates.** How often the stored nearest place lies inside each band at all, on the same 180 held-out checks. It is also the agreement of a predictor that ignores distance and always answers "inside", so it is the baseline each agreement figure has to beat. Each city's are stored in `reach_calibration.checks.calibrationBaseline` and copied into its payload's `meta.completeness.checks`.

| City | 5 min | 10 min | 15 min | 20 min |
|---|---|---|---|---|
| Amsterdam | 56.1% | 79.4% | 87.2% | 89.4% |
| Berlin | 43.9% | 78.3% | 90.6% | 97.8% |
| London | 47.8% | 83.9% | 93.9% | 98.9% |
| Munich | 48.9% | 82.8% | 91.7% | 95.0% |
| New York | 45.6% | 80.6% | 90.6% | 95.6% |
| Paris | 76.1% | 98.3% | 99.4% | 100.0% |
| Sydney | 59.4% | 91.1% | 97.8% | 99.4% |
| Tokyo | 53.9% | 83.3% | 95.6% | 97.8% |

- **At 15 and 20 minutes the agreement is close to the always-inside baseline in the dense cities.** At 20 minutes it equals it in London (98.9%) and Paris (100%), and falls 1.1 points below it in Berlin (96.7% against 97.8%). At 15 minutes it is within 4 points of it everywhere except Amsterdam (+11.7), Munich (+6.1) and New York (+5.0), and Paris gains nothing (99.4% both). Always answering "inside" would clear the 80% bar at 15 minutes in every city, so passing at 15 and 20 minutes shows little on its own.
- **The 5-minute band is the informative one.** About half the places are inside it (44–59%, Paris 76%), so neither always answering "inside" nor always "outside" scores more than 56.1% in any city except Sydney (59.4%) and Paris (76.1%), while the estimate scores 85.0–93.3%. At 10 minutes the estimate is 1.1 (Paris) to 16.7 (New York) points above the base rate, and always-inside would fail the bar only in Amsterdam (79.4%) and Berlin (78.3%).

**Places per 100,000 residents, per need** (from each payload's `meta.completeness.perHundredThousand`):

| City | Supermarket | Pharmacy | Doctor | School | Park | Station |
|---|---|---|---|---|---|---|
| Amsterdam | 29 | 10.2 | 20.8 | 40.8 | 14.3 | 5.2 |
| Berlin | 37.9 | 18.6 | 49.9 | 29.9 | 35.7 | 9.6 |
| London | 13 | 13.2 | 16.3 | 33.3 | 16 | 6.3 |
| Munich | 35.9 | 19 | 65 | 28.8 | 26.9 | 8.5 |
| New York | 13.4 | 13.4 | 18.9 | 28.6 | 8.4 | 6.6 |
| Paris | 22.5 | 38.7 | 25.8 | 55.6 | 8.2 | 12.8 |
| Sydney | 31.8 | 22.3 | 19.8 | 15.9 | 26.9 | 13.4 |
| Tokyo | 21.1 | 26 | 26.5 | 21.8 | 7.7 | 6.8 |

These figures describe what OSM holds for each city, and they are not corrected for how thoroughly each city is mapped. **The station column counts `station` and `halt` places only** (in OSM these include most metro stations), not tram stops or metro entrances: a station has several mapped entrances and a tram line a stop every few hundred metres, so counting those would measure how entrances and stops are mapped. The nearest-station distances still use all four categories. On this count Sydney (13.4) and Paris (12.8) are highest and Amsterdam (5.2) lowest: inside Amsterdam's outline there are 44 stations and 2 halts, against 428 tram stops that this figure leaves out. London, New York, Paris and Sydney have no `halt` at all. (The first publish counted all four categories, which gave 13 to 63.)

**Places and parks, before and after the reload.** "Before" is the local copy's count before each city was reseeded, standing in for production's. Berlin's comes from the committed file production was seeded from, because the local copy had already been reseeded. The new categories (pharmacy, doctors, clinic, school, station, halt, tram stop, metro entrance) account for most of the growth in every city.

| City | Places before | Places after | Categories | Park shapes stored |
|---|---|---|---|---|
| Amsterdam | 6,399 | 9,003 | 11 → 19 | 406 |
| Berlin | 23,291 | 30,336 | 11 → 19 | 3,093 |
| London | 34,868 | 44,442 | 11 → 18 | 3,982 |
| Munich | 11,591 | 15,832 | 11 → 19 | 1,260 |
| New York | 23,800 | 34,477 | 11 → 18 | 3,025 |
| Paris | 23,762 | 34,745 | 11 → 18 | 1,718 |
| Sydney | 12,628 | 14,598 | 11 → 17 | 3,446 |
| Tokyo | 43,480 | 58,361 | 11 → 19 | 7,696 |

The eight "after" counts add up to 241,794 places. Park shapes are every park stored; the park need counts only those of at least 0.5 ha.

**London doctors against the NHS practice list** (`npm run reach:check-gp`, 2026-10-20):

- 6,556 active GP practices in England; 6,555 were located by postcode (one postcode has no position in postcodes.io), and 1,142 of those lie inside London's outline.
- London has 1,107 `doctors` and 690 `clinic` places, 1,797 in all.
- For each of the 1,142 practices, the nearest doctors or clinic place is a median of 57 m away (90th percentile 709 m, farthest 4,939 m).
- **807 of the 1,142 (70.7%) have one within 150 m.** The share is stored as 0.707 in London's payload.
- This is a finding, not a pass: about three in ten practices have no OSM doctor or clinic within 150 m. The test is strict, because a postcode places a practice only roughly and OSM may position or tag a surgery differently, so it does not say how many are really missing. It does mean London's distances to a doctor may be overstated.

**Findings from the run:**

- **London's payload exceeds the 450 KB target** (583,036 B against 450,000 B), accepted for Phase 1. The payload already leaves out cells with no residents, but only 6% of London's cells are unpopulated (1,037 of the 16,875 in its outline), so that saves little against the target. The payload costs about 37 bytes a cell in both London and Berlin, and the outlines are 55% of London's file. An offline experiment on the payload as first published showed that rounding coordinates to 4 decimals saves only 5.3%, while leaving the outlines out (the browser could rebuild each hexagon from its H3 id) would give 233,558 B. Meeting the target therefore needs a format decision, not trimming precision. The other seven cities are within 450 KB.
- **New York's outline needed the sliver guard** (see Population above). Without it `reach:build` could not finish for New York.
- **Both endpoints and the list filters were checked in-process, not on the deployed API.** A throwaway script ran the Express app on port 3098 against the local database. For all eight cities, `GET /reach` answered 200 with the right city and coverage label, one feature per populated cell, `Content-Encoding: br`, a strong ETag and `Cache-Control: public, max-age=86400`; a card for one real cell of each city answered 200 with six needs. `GET /pois` and `POST /pois/within` left out `tram_stop` and `subway_entrance` in all eight cities, and so did the district stats of Berlin, Amsterdam and New York. A temporary district holding no places (in the local copy only, deleted afterwards) returned zero counts. The same checks on the deployed API are part of the production runbook. After the production load on 2026-11-06 they passed there for both reach endpoints and `GET /pois` in all eight cities (71 checks, including the stored ETag and compressed size reaching the client unchanged, `304`, and plain JSON without Brotli), and for `POST /pois/within` and district stats in Berlin.
- **Coverage is uneven, as OSM tagging is.** The 19 categories are a fixed set, not a promise that every city has all of them (see the Categories column above).

## Amendments while building Phase 2

Decisions made while building `reach/interface` on 2026-11-06, from the Phase 2 plan (`docs/superpowers/plans/2026-11-06-everyday-reach-phase-2-interface.md`; the numbers in brackets are its decision numbers) and the reviews of its tasks. Where one of them differs from "Phase 2 — Interface" below, this section wins. They are checked by unit tests; the live browser checks (plan Task 12) have not run yet.

### Recolouring

Recolouring: measurement pending (Task 1); provisional settings feature state, recolour on release

### Switching, fetching and links

- **Reach and the other full-map views turn each other off (2).** Turning reach on switches off the heatmap and the isochrone, route and draw tools; turning any of them on switches reach off (`lib/viewExclusivity.ts`). The heatmap and the tools still coexist with each other, as before.
- **In a link, a tool or the heatmap beats `reach` (3).** The spec names only tools. The app never writes the heatmap and reach into one link, so a hand-made link with both resolves the same way (`effectiveReach` in `lib/shareCodec.ts`). An invalid `t` or `n` drops the `reach` entry, but an invalid `c` drops only `c`, and `n` is de-duplicated and put in display order (4).
- **The payload is fetched the first time the switch goes on for a city, never in advance (5).** A 404 is not retried, and it keeps that city's switch disabled with "Not built for this city yet".

### Colours and 3D

- **The three classes are three solid colours, and the flat fill fades as a whole layer (6).** Mapbox GL 3.20's `fill-extrusion-color` ignores a colour's alpha, so the columns could not share a translucent ramp with the flat fill. The final tokens in `theme.ts` are `REACH_CLASS.allMet = CYAN` (`ROLE.answer`), `oneMissing = darken(CYAN, 0.45)` and `twoPlusMissing = darken(CYAN, 0.82)`, with `REACH_FILL_OPACITY = 0.8` for the flat fill; the columns draw the same colours solid. The plan began the darkest class at `darken(CYAN, 0.72)`, which the contrast guard (`reachContrast.test.ts`) failed at 1.84:1 against its neighbour. On `SURFACE.land` the neighbouring classes now measure 2.56:1 and 2.19:1 flat, and 2.93:1 and 2.71:1 solid; the selection casing measures 6.48:1 against the flat all-met class. These replace the 2.1:1 and 2.7:1 of a three-class ramp in "Measured facts".
- **Columns rise 0.1 m per estimated resident in every city (7)** (`REACH_EXTRUSION_M_PER_RESIDENT`). **New York's columns are the tallest, not Paris's** as "Map" below expected. Measured on production on 2026-11-06, the busiest blocks hold 8,920 estimated residents in New York (about 892 m tall), 7,705 in Sydney, 6,000 in Paris (about 600 m), 4,810 in Tokyo and 4,076 in London. Paris has the highest median block (2,103 residents, against 234 in Amsterdam, the lowest), but not the single busiest one.

### Panel

- **The per-need bars show all six needs at the chosen time, with the unchosen ones dimmed (9).**
- **With two chosen needs the headline reads "of both chosen needs"**, not "of all two chosen needs".
- **The 80% bar stays (19; owner, 2026-11-06).** The method note shows each offered limit's agreement beside what always answering "within" would score (each payload's `meta.completeness.checks.calibrationBaseline`), and says the 5-minute figure is the informative one.
- **Percentages (20).** A share shows as a whole percent, except that one from 99.5% to just under 100% shows one decimal, rounded down, and one above 0 and below 0.5% shows "<1%". Only an exact 0 or 1 reads "0%" or "100%" (`percent` in `lib/reach/copy.ts`). Paris at 20 minutes, all six needs, reads 99.9%.

### Selection, the block card, lines and pins

- **A selection never reloads the reach tiles (12).** The 2D outline is a gold line over a dark casing: two line layers on a one-block source of their own. In 3D the selected column turns `ROLE.you` through the feature state `selected`, which works because the reach source uses `promoteId: 'h'`. Neither changes a filter or a data-driven paint property on the reach source, each of which makes Mapbox reload every tile of it.
- **The card follows the payload (14).** Each row's minutes and ✓/✗ come from the payload's metres and `k`, the numbers the block's colour comes from, so they show before the card request has returned. The card endpoint supplies only each place's name, category and position. The payload is cached by the browser for a day while the card is read fresh, so after a data reload they can differ: when the card's metres or `k` differ from the payload's, it says "This block's data has changed since the map loaded. Reload to update." and no lines are drawn.
- **Only chosen needs are marked (15).** ✓/✗, lines and pins apply to the chosen needs only, and unchosen rows on the card are dimmed and unmarked. As the spec says, lines and pins go only to needs within the limit.
- **Category pins are DOM markers (16)** that render `CategoryIcon` through `react-dom/client`. They are built in `lib/mapPins.ts` with `createElement` rather than JSX, and their roots are unmounted on the next tick, outside React's commit: unmounting a root during a commit makes React 19.2 log a warning, and passive-effect cleanups run inside the commit.
- **Card names (17).** Tram stops and metro entrances, which can be a block's nearest station, are labelled "Tram stop" and "Metro entrance" with their own icons. A place without a name shows as "Unnamed park", "Unnamed tram stop" and so on.
- **The desktop block card shares the spotlight card's slot** (`MapCardSlot`), so the reduced-motion setting now also applies to the spotlight card.

### Layer order

- **District outlines draw above the blocks (18; owner, 2026-11-06).** The reach fill and columns sit beneath the district layers, so the outlines stay readable over the blocks: a deliberate exception to "context under answers", noted in `lib/layerOrder.ts`.

### Headlines

Measured on 2026-11-06 (20:28 UTC) from the deployed API, `GET /reach` for each city (payloads built that day), with the app's summary rule: the share of estimated residents whose block has all six needs within 15 minutes (`metres ≤ 15 × k`) at the published `k`, and at `kLow` and `kHigh` for the range, formatted with the percent rule above. Alphabetical, and not a ranking (see "Comparing cities" under "Decisions made during design"). The README carries the same table.

| City | Coverage | k (kLow–kHigh) | Headline | Range | Shares at k, kLow, kHigh |
|---|---|---|---|---|---|
| Amsterdam | whole city | 69.5 (62–70.5) | 74% | 69–75% | 0.74093, 0.69139, 0.74543 |
| Berlin | whole city | 62.5 (57–68) | 67% | 62–72% | 0.67420, 0.62378, 0.71744 |
| London | all 33 boroughs | 66.5 (59.5–70) | 69% | 60–73% | 0.68819, 0.59834, 0.72900 |
| Munich | whole city | 65 (61–69) | 81% | 78–85% | 0.81026, 0.77939, 0.84639 |
| New York | the five boroughs | 69 (67–77) | 73% | 71–78% | 0.72942, 0.71269, 0.77663 |
| Paris | the 20 arrondissements | 68.5 (65–73.5) | 99% | 99%–99.5% | 0.99425, 0.99111, 0.99564 |
| Sydney | 33 inner suburbs | 69.5 (59.5–73.5) | 93% | 90–96% | 0.93051, 0.90433, 0.95719 |
| Tokyo | the 23 wards | 65 (63.5–75) | 81% | 80–89% | 0.81312, 0.79662, 0.88569 |

- **Paris's range reads "99%–99.5%"**, the panel's `rangeLine` form when an end isn't a whole percent: at `kHigh` its share is 99.564%, which the percent rule shows as 99.5% rather than rounding up to 100%. (The plan had listed "99–100%".) At 20 minutes Paris reads 99.9%.
- Every city offers all four stops and passes; no block in any city has a need with no place (no 65535 distances).
- Tokyo's figures match the welcome example's (81%, range 80–89%).

### Where it breaks

Calibration step 7 asked for the cells with the largest misses, two or three of them in the README with screenshots. The README lists the three held-out blocks with the most wrong checks in the 2026-11-06 production calibration, out of 24 each (six needs at four limits), graded at the fit half's `k` as the calibration grades them. "Within" means the estimate or Mapbox counts the stored nearest place as inside that limit; metres are straight-line, to a park's edge.

| Block | k_fit | Wrong | Estimate within, Mapbox not | Mapbox within, estimate not | Link's `t` |
|---|---|---|---|---|---|
| Tokyo `892f5aadb8fffff` (35.67383, 139.71863) | 63.5 | 7 | school at 5 and 10 (276 m), metro entrance at 5 (303 m), park at 10 (370 m), supermarket at 10 (487 m) | doctor at 5 (332 m), pharmacy at 5 (333 m) | 5 |
| Munich `891f8d4e977ffff` (48.08126, 11.49144) | 64.5 | 5 | park at 10 (439 m), supermarket at 10 (465 m), school at 10 (621 m) | doctor at 10 (751 m), metro entrance at 15 (998 m) | 10 |
| Berlin `891f1d482b7ffff` (52.52519, 13.27961) | 57.5 | 5 | park at 10 and 15 (Schlosspark Charlottenburg, 379 m), school at 15 and 20 (857 m) | station at 15 (Westend, 863 m) | 15 |

- **Where the lists come from.** The calibration prints each wrong check as need@limit. Tokyo's and Munich's lists are from the production run's output. Berlin's production output was not kept, so its list is from the local run of 2026-10-20 (`pk@10,15 sc@15,20 st@15`), which production reproduced block for block from the same inputs and the same cached isochrones. Which way each check went was reconstructed offline with the calibration's rules (the nearest place on the spheroid from the committed place files and the 2026-10-20 park files, a park counted from 0.5 ha and measured to its edge, and a place inside a limit when Mapbox's cached isochrone touches it). The reconstruction gives exactly the printed lists for all three blocks, and the metres are the production block cards' (`GET /reach/:cellId` on 2026-11-06), which equal each block's payload properties.
- **At the published `k`, which the map uses** (Tokyo 65, Munich 65, Berlin 62.5, each a little faster than the fit half's), Tokyo and Munich keep the same misses and Berlin has 4: Westend station (863 m, 13.8 minutes) counts as within 15, as Mapbox says. The README says so.
- **The share links** frame each block at zoom 15, flat, with all six needs, the block selected (`c`) and `t` at the limit with the most misses, and no tool. Each was encoded as the app's codec encodes and decoded back through `decodeState` to the same object. They open only once Phase 2 is merged and deployed, and need checking then.
- **Screenshots** of the three blocks have not been taken: they are to come from the owner after the deploy. Until then, or if the owner declines, the links stand alone.

## Phase 2 — Interface (`reach/interface`)

### First task: measure recolouring speed

In the real app with real data, time how long Mapbox takes to restyle the fill and the 3D columns when the time or the needs change.

- With only four slider stops, restyles happen on discrete changes only.
- If a restyle costs more than a frame on a mid-range phone, the map recolours when the slider is released, while the headline still updates live.

### Layer and exclusivity

- **"Everyday reach" is a fifth switch in the sidebar's *01 Layers***, with its panel opening underneath it.
- **It and the other full-map views turn each other off.** Turning it on switches off the heatmap and any active analysis tool (isochrone, route, draw), and turning any of those on switches it off. This uses the same `getState()` pattern the tools already use with each other. District outlines may stay on.
- **Map clicks.** A new branch in `MapView`'s click handler means a click selects a cell instead of falling through to road, building or district selection.

### Panel (top to bottom)

1. **Coverage line:** for example "Berlin · whole city · 3.8 M estimated residents".
2. **Headline:** a large percentage, the sentence it belongs to, and "range 58–64%". One line explains the range: how much the result moves with calibration uncertainty.
3. **Controls:** "Within [5 · 10 · 15 · 20] minutes of", showing only the stops that passed the bar, then six need chips. Each chip is a toggle button, and at least one stays on.
4. **One bar per need:** the share of residents within the limit, using the existing results bars.
5. **Legend:** three classes, *all met* / *one missing* / *two or more missing*. With a single need chosen it becomes *met* / *not met*.
6. **"How this is measured":**
   - the method, and agreement for each band;
   - the data sources and dates;
   - places per 100,000 residents;
   - the London GP check;
   - the limits: estimated residents, buses excluded, measured from each block's centre.

### Map

- **Fill colours.** Three cyan classes (`ROLE.answer`), from tokens in `theme.ts`, in the answer slot of the layer stack (`lib/layerOrder.ts`).
- **The selected cell** is drawn as a gold (`ROLE.you`) line on a dark casing, because gold on cyan alone is 1.03:1.
- **With 3D on:**
  - cells extrude by residents, using one scale for every city; Paris, at about 20,000 per km², will be the tallest;
  - the scale is tuned once the real population figures exist;
  - the colour is still the class;
  - 3D buildings are hidden while the layer is on.
- **Lines and pins.** Cyan lines run from the selected cell's centre to its nearest places, but only for needs within the current limit, each with a category pin.

### Block card

- **Position:** the spotlight card's slot. It never shows at the same time as the spotlight, because the heatmap is off while this layer is on.
- **Content:**
  - "This block · about 420 residents";
  - one row per need: icon, place name, minutes, and ✓ or ✗ against the limit;
  - a footnote: "Estimated walking times, measured from the block's centre".
- **Interaction:** tapping a ✗ row flies the map to that place.

### Phones

- **One bottom card.** It shows the headline when nothing is selected, and the selected block otherwise, with "Back to the city".
- **Why not a top bar:** the search box spans the top of the map on phones, so nothing new goes there.
- **The server status pill** shares the bottom only while the server is waking, and the layer can't load until then anyway.

### Share links (`lib/shareCodec.ts`, `lib/shareState.ts`)

**A new optional `reach` entry**, separate from `layers`:

- `t`: one of 5, 10, 15 or 20;
- `n`: a non-empty set of need keys;
- `c`: an optional H3 cell id.

**Validation and compatibility:**

- `decodeState` validates `reach` field by field and drops it if invalid.
- Old links decode unchanged, with the layer off.
- If a link holds both a tool and `reach`, the tool wins.

### Welcome card (`lib/examples.ts`)

The Tokyo heatmap example is replaced by an Everyday reach example: 15 minutes, all six needs, 3D, tilted.

- **City:** chosen from the real results for interest and data trust, defaulting to Tokyo. That keeps one non-European city among the three examples.
- **Kicker:** must contain no digits, as `examples.test.ts` requires.

### States and accessibility

- **States:**
  - **Loading:** a spinner on the switch.
  - **Error:** a message and Retry in the panel.
  - **No data for the city:** the switch is disabled with "Not built for this city yet".
  - **City failed the bar:** the switch is disabled with "Estimate not reliable here yet".
  - **Cold start:** handled by the existing status pill.
- **Accessibility:**
  - the slider announces "15 minutes";
  - colour is never the only cue, because the headline is text and the card has ✓ and ✗;
  - the reduced-motion setting is respected.

### Phase 2 tests (Vitest, pure logic)

- **Calculations:** headline and per-need sums over typed arrays on small fixtures, and the range at `k_low` and `k_high`.
- **The class expression builder:** needs and time in, a Mapbox expression out.
- **The `reach` share entry:** valid and invalid cases, old links unchanged, and a tool winning a conflict.
- **The new example** round-trips through the codec and has a digit-free kicker.
- **A contrast guard** in the spirit of `colourGuard.test.ts`: on `SURFACE.land`, neighbouring classes must be at least 2:1 apart, and the selection casing at least 3:1 against the strongest class.

### Verified live

- Both endpoints with `curl`.
- The recolouring measurement.
- In the browser, with the owner's servers running:
  - each state, and every way of switching the layer;
  - a 3D view, and phone width;
  - a share link round trip, and the welcome example;
  - zero console errors.

## Documentation

- **README:**
  - a feature row;
  - "How Everyday reach is measured": the method, calibration results, where it breaks, and sources (OpenStreetMap under ODbL; GHSL under CC BY 4.0, with its citation);
  - each city's headline with its coverage label, and no ranking;
  - the two API rows;
  - the rebuild rule.
- **`CLAUDE.md`:** the rebuild rule, and migrations 003 and 004.
- **This spec:** amended as each phase lands.

## Success criteria

1. A first-time visitor can read a city's headline and what it covers within 10 seconds of switching the layer on.
2. Changing the time or the needs updates the headline within one frame, and the map within the limit set by the recolouring measurement.
3. Every number shown can be traced to the method note: agreement, range, sources and dates.
4. Card and colour never disagree for a block.
5. The layer works at phone width without covering the search box.
6. Old share links still open exactly as before.

## Owner actions

- Merge `chore/keep-warm` and `fix/district-outlines`.
- Approve each GHSL tile download, and the production reload.
- Restrict the public Mapbox token to the Vercel domain and localhost, and create a script-only token for the backend `.env`.
- After the keep-warm merge, create the cron-job.org ping.

## Notes for the implementer

- **The map.** All Mapbox mutation lives in `MapView.tsx`. Map event handlers read stores with `getState()`.
- **TypeScript and colours.** Strict TypeScript with no `any`, and `import type` for types. Backend relative imports end in `.js`. No colour literals outside `theme.ts`.
- **Overpass** needs the pipeline's `User-Agent`, or it answers 406. Back off on 502 "at capacity".
- **Production checks.** Read-only checks against production run on one connection, inside `BEGIN READ ONLY … ROLLBACK`. Inside that transaction and before any check query, run `SHOW transaction_read_only` and require `on`. A session `SET default_transaction_read_only` alone isn't reliable on a pooled URL, and a `SHOW` run outside the transaction, or on another pooled connection, proves nothing about it. Any production write needs the owner's go-ahead first.
- **Never commit** GHSL tiles or other downloaded data.
- **Commits** are granular, staged by explicit path, with **no `Co-Authored-By` trailer**.
