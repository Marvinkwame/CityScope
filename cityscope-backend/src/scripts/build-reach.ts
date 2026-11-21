// Builds one city's everyday-reach cells.
//
// 1. Takes the city outline (its districts, unioned) and covers it with H3
//    cells (resolution 9).
// 2. Adds up GHSL residents into those cells and keeps the populated ones.
// 3. Writes the cells to reach_cells, then, for each of the six needs, finds
//    the nearest place to every cell centre (reach_nearest).
//
// Usage: tsx src/scripts/build-reach.ts <cityId> [--method network|estimate] [--ghsl <dir>] [--dry-run]
//
// --method network (the default) measures each walk along the city's street
// network (data/streets-<city>.json, from fetch:streets) and stores the walk's
// line. --method estimate is the earlier straight-line search inside PostGIS.
//
// --dry-run stops after the resident counts and writes nothing: the session is
// made read-only and announceTarget() is not called. A real run announces its
// target, then replaces the city's reach rows in one transaction.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellToBoundary, cellToLatLng } from 'h3-js';
import type { PoolClient } from 'pg';
import { CITY_CONFIGS } from '../config/cities.js';
import type { CityConfig } from '../config/cities.js';
import pool from '../db.js';
import { announceTarget, describeDatabase } from '../lib/dbTarget.js';
import { isAreaGeometry } from '../lib/geometry.js';
import type { AreaGeometry } from '../lib/geometry.js';
import { parseBuildArgs } from '../lib/buildReachArgs.js';
import { readGhslWindow } from '../lib/ghsl.js';
import { joinBlocks, nearestByStreet, PARK_ENTRY_SPACING_METRES } from '../lib/networkNearest.js';
import type { BlockInput, NeedStats, NetworkRow, PlaceInput } from '../lib/networkNearest.js';
import { NodeIndex } from '../lib/nodeIndex.js';
import { NEEDS, NONE_FOUND_METRES, PARK_MIN_AREA_M2 } from '../lib/needs.js';
import type { Need } from '../lib/needs.js';
import { placeCountQuery } from '../lib/needPlaces.js';
import { addPixelsToCells, cellsForOutline, keptCells, tilesForBox } from '../lib/population.js';
import type { Box } from '../lib/population.js';
import { buildStreetGraph } from '../lib/streetGraph.js';
import type { StreetGraph } from '../lib/streetGraph.js';
import { parseStreetsFile } from '../lib/streets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GHSL_DIR = path.resolve(__dirname, '../../data/ghsl');

const CELL_BATCH_SIZE = 500;

function usage(): never {
  console.error('Usage: tsx src/scripts/build-reach.ts <cityId> [--method network|estimate] [--ghsl <dir>] [--dry-run]');
  console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
  process.exit(1);
}

// The city outline: its districts merged into one shape. A suffix on the city's
// config (Tokyo's wards) limits it to districts whose name ends with it, so
// the 23 wards are kept apart from the rest of the metropolis.
const OUTLINE_SQL = `
  SELECT ST_AsGeoJSON(ST_Union(geom)) AS outline
  FROM districts
  WHERE city_id = $1 AND ($2::text IS NULL OR name LIKE '%' || $2)
`;

async function readOutline(client: PoolClient, city: CityConfig, readOnly: boolean): Promise<AreaGeometry> {
  // A dry run reads inside an explicitly read-only transaction as well as a
  // read-only session, because DATABASE_URL may point at a pooled connection,
  // where a session-level setting is not guaranteed to stay with the next
  // statement. A read-only transaction is pinned to one connection.
  try {
    if (readOnly) {
      await client.query('BEGIN READ ONLY');
      const { rows } = await client.query<{ transaction_read_only: string }>('SHOW transaction_read_only');
      if (rows[0]?.transaction_read_only !== 'on') {
        throw new Error('Could not make the dry run read-only; refusing to continue');
      }
    }

    const { rows } = await client.query<{ outline: string | null }>(OUTLINE_SQL, [
      city.id,
      city.reach.districtNameSuffix ?? null,
    ]);
    const text = rows[0]?.outline;
    if (!text) {
      throw new Error(`No districts found for ${city.id}; run "npm run seed:all" first`);
    }
    const outline: unknown = JSON.parse(text);
    if (!isAreaGeometry(outline)) {
      throw new Error(`The ${city.id} outline is not a Polygon or MultiPolygon`);
    }
    return outline;
  } finally {
    if (readOnly) await client.query('ROLLBACK').catch(() => undefined);
  }
}

/** The bounding box of an outline, in degrees. */
function boxOf(outline: AreaGeometry): Box {
  const polygons = outline.type === 'Polygon' ? [outline.coordinates] : outline.coordinates;
  const box: Box = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        box.south = Math.min(box.south, lat);
        box.north = Math.max(box.north, lat);
        box.west = Math.min(box.west, lng);
        box.east = Math.max(box.east, lng);
      }
    }
  }
  return box;
}

interface Residents {
  /** Cells whose centres lie inside the outline. */
  cellsInOutline: number;
  /** Whole residents per kept cell: the cells left with at least one person. */
  kept: Map<string, number>;
  total: number;
  tilesTouched: string[];
  tilesRead: string[];
}

async function countResidents(outline: AreaGeometry, ghslDir: string): Promise<Residents> {
  const allowed = cellsForOutline(outline);
  const box = boxOf(outline);
  const tilesTouched = tilesForBox(box);

  const summed = new Map<string, number>();
  const tilesRead: string[] = [];
  for (const tile of tilesTouched) {
    const window = await readGhslWindow(ghslDir, tile, box);
    if (window === null) continue;
    addPixelsToCells(summed, window.values, window.grid, window.win, allowed);
    tilesRead.push(tile);
  }

  const kept = keptCells(summed);
  let total = 0;
  for (const people of kept.values()) total += people;
  return { cellsInOutline: allowed.size, kept, total, tilesTouched, tilesRead };
}

const INSERT_CELLS = `
  INSERT INTO reach_cells (city_id, h3, residents, outline, centre)
  SELECT
    $1::varchar,
    x.h3,
    x.residents,
    ST_SetSRID(ST_GeomFromGeoJSON(x.outline), 4326),
    ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326)
  FROM unnest($2::text[], $3::int[], $4::text[], $5::float8[], $6::float8[])
    AS x(h3, residents, outline, lng, lat)
`;

// One statement per need: for every cell, its single nearest place by distance
// on the spheroid, in metres. The `<->` ordering is served by the geography
// GiST index (migration 004). 65534 is one below NONE_FOUND_METRES, so a real
// distance can never be mistaken for "no place at all". $1 is the city, $2 the
// need, $3 the POI categories that satisfy it.
const NEAREST_POI_SQL = `
  INSERT INTO reach_nearest (city_id, h3, need, place_kind, place_id, metres, method)
  SELECT c.city_id, c.h3, $2::text, 'poi', n.id, LEAST(round(n.d), 65534)::int, 'estimate'
  FROM reach_cells c
  CROSS JOIN LATERAL (
    SELECT p.id, ST_Distance(p.geom::geography, c.centre::geography) AS d
    FROM pois p
    WHERE p.city_id = c.city_id AND p.category = ANY($3::text[])
    ORDER BY p.geom::geography <-> c.centre::geography
    LIMIT 1
  ) n
  WHERE c.city_id = $1
`;

// The park variant measures to the park's edge, and ignores parks under the
// minimum area. $3 is that minimum, in square metres.
const NEAREST_PARK_SQL = `
  INSERT INTO reach_nearest (city_id, h3, need, place_kind, place_id, metres, method)
  SELECT c.city_id, c.h3, $2::text, 'park', n.id, LEAST(round(n.d), 65534)::int, 'estimate'
  FROM reach_cells c
  CROSS JOIN LATERAL (
    SELECT k.id, ST_Distance(k.geom::geography, c.centre::geography) AS d
    FROM parks k
    WHERE k.city_id = c.city_id AND k.area_m2 >= $3
    ORDER BY k.geom::geography <-> c.centre::geography
    LIMIT 1
  ) n
  WHERE c.city_id = $1
`;

function nearestStatement(need: Need): { sql: string; thirdParam: string[] | number } {
  return need.source === 'parks'
    ? { sql: NEAREST_PARK_SQL, thirdParam: PARK_MIN_AREA_M2 }
    : { sql: NEAREST_POI_SQL, thirdParam: [...need.categories] };
}

function seconds(since: number): string {
  return `${((performance.now() - since) / 1000).toFixed(1)} s`;
}

const WALK_BATCH_SIZE = 1000;

const INSERT_WALKS = `
  INSERT INTO reach_nearest (city_id, h3, need, place_kind, place_id, metres, method, walk)
  SELECT $1, x.h3, $2, $3, x.place_id, x.metres, 'network', ST_SetSRID(ST_GeomFromGeoJSON(x.walk), 4326)
  FROM unnest($4::text[], $5::int[], $6::int[], $7::text[]) AS x(h3, place_id, metres, walk)
`;

// One point per PARK_ENTRY_SPACING_METRES along each park's edge: a park is
// entered from its boundary. $2 is the minimum area, $3 the spacing.
const PARK_ENTRIES_SQL = `
  SELECT k.id, ST_X(d.geom) AS lng, ST_Y(d.geom) AS lat
  FROM parks k
  CROSS JOIN LATERAL ST_DumpPoints(ST_Segmentize(ST_Boundary(k.geom)::geography, $3)::geometry) d
  WHERE k.city_id = $1 AND k.area_m2 >= $2
  ORDER BY k.id, d.path
`;

interface Network {
  graph: StreetGraph;
  index: NodeIndex;
}

interface NetworkNeed {
  need: Need;
  kind: 'poi' | 'park';
  rows: NetworkRow[];
  stats: NeedStats;
}

const count = (n: number): string => n.toLocaleString('en-GB');

/** Reads the city's street file and builds the graph and index, before any transaction. */
async function loadNetwork(cityId: string): Promise<Network> {
  const startedAt = performance.now();
  const file = path.resolve(__dirname, `../../data/streets-${cityId}.json`);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`No street network for ${cityId}. Run npm run fetch:streets -- ${cityId} first`);
      process.exit(1);
    }
    throw err;
  }
  const graph = buildStreetGraph(parseStreetsFile(text));
  const index = new NodeIndex(graph);
  const share = ((graph.nodeCount / graph.fileNodeCount) * 100).toFixed(1);
  console.log(
    `Street graph: ${count(graph.nodeCount)} of ${count(graph.fileNodeCount)} nodes kept ` +
      `(${share}%, largest connected part) (${seconds(startedAt)})`,
  );
  return { graph, index };
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function readPlaces(client: PoolClient, cityId: string, need: Need): Promise<PlaceInput[]> {
  const { rows } =
    need.source === 'parks'
      ? await client.query<{ id: number; lng: number; lat: number }>(PARK_ENTRIES_SQL, [
          cityId,
          PARK_MIN_AREA_M2,
          PARK_ENTRY_SPACING_METRES,
        ])
      : await client.query<{ id: number; lng: number; lat: number }>(
          'SELECT id, lng, lat FROM pois WHERE city_id = $1 AND category = ANY($2::text[]) ORDER BY id',
          [cityId, [...need.categories]],
        );
  return rows.map((r) => ({ placeId: r.id, lng: r.lng, lat: r.lat }));
}

/** Joins the blocks to the network and finds each need's nearest place by street. Writes nothing. */
async function measureNetwork(
  client: PoolClient,
  cityId: string,
  blocks: readonly BlockInput[],
  network: Network,
): Promise<NetworkNeed[]> {
  const { joins, far } = joinBlocks(network.index, blocks);
  const joinMetres = joins.map((j) => j.metres).sort((a, b) => a - b);
  console.log(
    `Block joins to the network: median ${percentile(joinMetres, 0.5).toFixed(0)} m, ` +
      `95th percentile ${percentile(joinMetres, 0.95).toFixed(0)} m, ` +
      `maximum ${joinMetres[joinMetres.length - 1].toFixed(0)} m`,
  );
  if (far.length === 0) console.log('  No block is more than 150 m from the network');
  for (const f of far) console.log(`  Far from the network: ${f.h3} (${f.metres.toFixed(0)} m)`);

  const results: NetworkNeed[] = [];
  for (const need of NEEDS) {
    const startedAt = performance.now();
    const places = await readPlaces(client, cityId, need);
    if (places.length === 0) {
      console.log(
        `  ${need.id} ${need.label}: no places in the city's data, skipped; ` +
          `all ${count(blocks.length)} blocks read as ${NONE_FOUND_METRES} m`,
      );
      continue;
    }
    const kind = need.source === 'parks' ? 'park' : 'poi';
    const { rows, stats } = nearestByStreet(network.graph, network.index, joins, places, kind);
    const detour =
      stats.medianDetour === null ? 'no detour measured' : `median detour ${stats.medianDetour.toFixed(2)}×`;
    const warning = rows.length === 0 ? ' WARNING: places exist but no block reaches any of them' : '';
    console.log(
      `  ${need.id} ${need.label}: ${count(rows.length)} rows from ${count(places.length)} ` +
        `${kind === 'park' ? 'park entry points' : 'places'}, ${count(stats.unreached)} blocks unreached, ` +
        `${detour} (${seconds(startedAt)})${warning}`,
    );
    results.push({ need, kind, rows, stats });
  }
  return results;
}

async function insertWalks(client: PoolClient, cityId: string, found: NetworkNeed): Promise<void> {
  for (let i = 0; i < found.rows.length; i += WALK_BATCH_SIZE) {
    const batch = found.rows.slice(i, i + WALK_BATCH_SIZE);
    await client.query(INSERT_WALKS, [
      cityId,
      found.need.id,
      found.kind,
      batch.map((r) => r.h3),
      batch.map((r) => r.placeId),
      batch.map((r) => r.metres),
      batch.map((r) => JSON.stringify({ type: 'LineString', coordinates: r.walk })),
    ]);
  }
}

async function reportWalkStorage(client: PoolClient, cityId: string): Promise<void> {
  const { rows } = await client.query<{ bytes: string | null }>(
    'SELECT sum(pg_column_size(walk))::bigint AS bytes FROM reach_nearest WHERE city_id = $1',
    [cityId],
  );
  console.log(`Walk storage: ${(Number(rows[0]?.bytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`);
}

async function writeNetworkNeeds(client: PoolClient, cityId: string, network: Network): Promise<void> {
  const { rows } = await client.query<{ h3: string; lng: number; lat: number }>(
    'SELECT h3, ST_X(centre) AS lng, ST_Y(centre) AS lat FROM reach_cells WHERE city_id = $1 ORDER BY h3',
    [cityId],
  );
  const found = await measureNetwork(client, cityId, rows, network);
  for (const f of found) await insertWalks(client, cityId, f);
  await reportWalkStorage(client, cityId);
}

async function writeCity(
  client: PoolClient,
  cityId: string,
  kept: ReadonlyMap<string, number>,
  network: Network | null,
): Promise<void> {
  const cells = [...kept];
  const startedAt = performance.now();

  await client.query('BEGIN');
  try {
    // City-scoped deletes, never TRUNCATE. Deleting the cells cascades to
    // reach_nearest; a rebuild also invalidates the calibration and the
    // published payload built from the old cells.
    await client.query('DELETE FROM reach_payloads WHERE city_id = $1', [cityId]);
    await client.query('DELETE FROM reach_calibration WHERE city_id = $1', [cityId]);
    await client.query('DELETE FROM reach_cells WHERE city_id = $1', [cityId]);

    const insertStartedAt = performance.now();
    for (let i = 0; i < cells.length; i += CELL_BATCH_SIZE) {
      const batch = cells.slice(i, i + CELL_BATCH_SIZE);
      const h3s: string[] = [];
      const residents: number[] = [];
      const outlines: string[] = [];
      const lngs: number[] = [];
      const lats: number[] = [];
      for (const [h3, people] of batch) {
        const [lat, lng] = cellToLatLng(h3);
        h3s.push(h3);
        residents.push(people);
        outlines.push(JSON.stringify({ type: 'Polygon', coordinates: [cellToBoundary(h3, true)] }));
        lngs.push(lng);
        lats.push(lat);
      }
      await client.query(INSERT_CELLS, [cityId, h3s, residents, outlines, lngs, lats]);
    }
    console.log(`Wrote ${cells.length.toLocaleString('en-GB')} cells (${seconds(insertStartedAt)})`);

    if (network !== null) {
      await writeNetworkNeeds(client, cityId, network);
    } else {
      for (const need of NEEDS) {
        const needStartedAt = performance.now();

        // With no place for the need anywhere in the city, the search below
        // would walk the whole index for every cell and find nothing. Count
        // first, and skip it: its cells read as the none-found distance.
        const counted = placeCountQuery(need, cityId);
        const { rows: countRows } = await client.query<{ places: number }>(counted.text, counted.values);
        if ((countRows[0]?.places ?? 0) === 0) {
          console.log(
            `  ${need.id} ${need.label}: no places in the city's data, skipped; ` +
              `all ${cells.length.toLocaleString('en-GB')} cells read as ${NONE_FOUND_METRES} m`,
          );
          continue;
        }

        const { sql, thirdParam } = nearestStatement(need);
        const result = await client.query(sql, [cityId, need.id, thirdParam]);
        const rows = result.rowCount ?? 0;
        const none = cells.length - rows;
        console.log(
          `  ${need.id} ${need.label}: ${rows.toLocaleString('en-GB')} rows (${seconds(needStartedAt)})` +
            (none > 0 ? `, ${none.toLocaleString('en-GB')} cells with no place, read as ${NONE_FOUND_METRES} m` : ''),
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    // A failed ROLLBACK must not hide the error that caused it.
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }

  console.log(`Built reach for ${cityId} in ${seconds(startedAt)}`);
}

async function main(): Promise<void> {
  const options = parseBuildArgs(process.argv.slice(2), DEFAULT_GHSL_DIR);
  if (options === null) usage();

  const city = CITY_CONFIGS.find((c) => c.id === options.cityId);
  if (!city) {
    console.error(`Unknown city: ${options.cityId}`);
    usage();
  }

  // A real run names its target before connecting. A dry run writes nothing,
  // so it has no target to announce.
  if (options.dryRun) {
    console.log(`Dry run: read-only, nothing is written (${describeDatabase(process.env.DATABASE_URL)})`);
  } else {
    announceTarget();
  }

  // The graph is built before any connection or transaction is opened.
  const network = options.method === 'network' ? await loadNetwork(city.id) : null;

  const client = await pool.connect();
  try {
    if (options.dryRun) {
      await client.query('SET default_transaction_read_only = on');
    }

    const startedAt = performance.now();
    const outline = await readOutline(client, city, options.dryRun);
    const residents = await countResidents(outline, options.ghslDir);

    console.log(`${city.name} (${city.reach.coverage})`);
    console.log(
      `GHSL tiles: ${residents.tilesRead.join(', ') || 'none'} read, ` +
        `${residents.tilesTouched.length} touched by the outline`,
    );
    console.log(`Cells in the outline: ${residents.cellsInOutline.toLocaleString('en-GB')}`);
    console.log(`Kept cells (at least 1 resident): ${residents.kept.size.toLocaleString('en-GB')}`);
    console.log(`Total residents: ${residents.total.toLocaleString('en-GB')} (${seconds(startedAt)})`);

    if (residents.kept.size === 0) {
      throw new Error(`No residents found for ${city.id}; nothing to build`);
    }
    if (options.dryRun) {
      if (network !== null) {
        const blocks = [...residents.kept.keys()].map((h3) => {
          const [lat, lng] = cellToLatLng(h3);
          return { h3, lng, lat };
        });
        await measureNetwork(client, city.id, blocks, network);
      }
      return;
    }

    await writeCity(client, city.id, residents.kept, network);
  } finally {
    if (options.dryRun) {
      // Undo the session setting on a connection a pooler may hand to others.
      await client.query('RESET default_transaction_read_only').catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
