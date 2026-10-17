// Builds one city's everyday-reach cells.
//
// 1. Takes the city outline (its districts, unioned) and covers it with H3
//    cells (resolution 9).
// 2. Adds up GHSL residents into those cells and keeps the populated ones.
// 3. Writes the cells to reach_cells, then, for each of the six needs, finds
//    the nearest place to every cell centre inside PostGIS (reach_nearest).
//
// Usage: tsx src/scripts/build-reach.ts <cityId> [--ghsl <dir>] [--dry-run]
//
// --dry-run stops after the resident counts and writes nothing: the session is
// made read-only and announceTarget() is not called. A real run announces its
// target, then replaces the city's reach rows in one transaction.

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
import { readGhslWindow } from '../lib/ghsl.js';
import { NEEDS, NONE_FOUND_METRES, PARK_MIN_AREA_M2 } from '../lib/needs.js';
import type { Need } from '../lib/needs.js';
import { addPixelsToCells, cellsForOutline, keptCells, tilesForBox } from '../lib/population.js';
import type { Box } from '../lib/population.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GHSL_DIR = path.resolve(__dirname, '../../data/ghsl');

const CELL_BATCH_SIZE = 500;

interface Options {
  cityId: string;
  ghslDir: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Options | null {
  let cityId: string | null = null;
  let ghslDir = DEFAULT_GHSL_DIR;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--ghsl') {
      const value = argv[++i];
      if (value === undefined) return null;
      ghslDir = path.resolve(value);
    } else if (arg.startsWith('--') || cityId !== null) {
      return null;
    } else {
      cityId = arg;
    }
  }

  return cityId === null ? null : { cityId, ghslDir, dryRun };
}

function usage(): never {
  console.error('Usage: tsx src/scripts/build-reach.ts <cityId> [--ghsl <dir>] [--dry-run]');
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

async function writeCity(client: PoolClient, cityId: string, kept: ReadonlyMap<string, number>): Promise<void> {
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

    for (const need of NEEDS) {
      const needStartedAt = performance.now();
      const { sql, thirdParam } = nearestStatement(need);
      const result = await client.query(sql, [cityId, need.id, thirdParam]);
      const rows = result.rowCount ?? 0;
      const none = cells.length - rows;
      console.log(
        `  ${need.id} ${need.label}: ${rows.toLocaleString('en-GB')} rows (${seconds(needStartedAt)})` +
          (none > 0 ? `, ${none.toLocaleString('en-GB')} cells with no place, read as ${NONE_FOUND_METRES} m` : ''),
      );
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
  const options = parseArgs(process.argv.slice(2));
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
    if (options.dryRun) return;

    await writeCity(client, city.id, residents.kept);
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
