// Publishes one city's "Everyday reach" result as a single compressed payload.
//
// Reads the cells and nearest places that "npm run reach:build" wrote and the
// calibration "npm run reach:calibrate" stored, assembles them into one GeoJSON
// FeatureCollection with a `meta` member, compresses it with Brotli and stores
// it, with a strong ETag, in reach_payloads. The API serves those bytes as they
// are, so nothing is computed per request.
//
// The reads and the write share one transaction: the payload is built from one
// snapshot of the city, and `built_at` is the transaction's now(), the same
// instant that meta.builtAt records.
//
// meta.sources says when the city's places and parks were fetched (from the
// records fetch:pois and fetch:parks write beside their files; see
// lib/sourceDates.ts) and when it was calibrated. A missing record is null.
//
// Usage: tsx src/scripts/publish-reach.ts <cityId>
// Needs a city that has been built and calibrated.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { CITY_CONFIGS } from '../config/cities.js';
import type { CityConfig } from '../config/cities.js';
import pool from '../db.js';
import { BANDS, cityPasses } from '../lib/calibration.js';
import type { Band } from '../lib/calibration.js';
import { announceTarget } from '../lib/dbTarget.js';
import { isPolygonGeometry } from '../lib/geometry.js';
import { NEEDS, NEED_IDS, PARK_MIN_AREA_M2, completenessCategories } from '../lib/needs.js';
import type { NeedId } from '../lib/needs.js';
import { isReachMethod } from '../lib/reachMethod.js';
import { buildReachPayload, encodePayload } from '../lib/reachPayload.js';
import type { CalibrationRow, CellRow, NearestRow, ReachInfo } from '../lib/reachPayload.js';
import { parksRecordName, placesRecordName, readFetchRecord, streetsRecordName } from '../lib/sourceDates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The places file and its record sit beside this script; the parks and street
// files and their records in cityscope-backend/data/.
const PLACES_DIR = __dirname;
const DATA_DIR = path.resolve(__dirname, '../../data');

function usage(): never {
  console.error('Usage: tsx src/scripts/publish-reach.ts <cityId>');
  console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
  process.exit(1);
}

function isBand(value: unknown): value is Band {
  return BANDS.some((band) => band === value);
}

function isNeedId(value: unknown): value is NeedId {
  return NEED_IDS.some((id) => id === value);
}

const CALIBRATION_SQL = `
  SELECT method, metres_per_minute, k_low, k_high, agreement, passing_stops, sample_size, checks, computed_at,
         now() AS built_at
  FROM reach_calibration
  WHERE city_id = $1
`;

interface CalibrationDbRow {
  method: string;
  metres_per_minute: number;
  k_low: number;
  k_high: number;
  agreement: unknown;
  passing_stops: number[];
  sample_size: number;
  checks: unknown;
  computed_at: Date;
  built_at: Date;
}

function readAgreement(value: unknown): Record<Band, number> {
  const stored = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const agreement: Record<Band, number> = { 5: 0, 10: 0, 15: 0, 20: 0 };
  for (const band of BANDS) {
    const share = stored[String(band)];
    if (typeof share !== 'number') {
      throw new Error(`The stored calibration has no agreement for the ${band} minute band`);
    }
    agreement[band] = share;
  }
  return agreement;
}

function readStops(values: readonly number[]): Band[] {
  const stops: Band[] = [];
  for (const value of values) {
    if (!isBand(value)) throw new Error(`The stored calibration has an unexpected passing band: ${value}`);
    stops.push(value);
  }
  return stops;
}

async function readCalibration(
  client: PoolClient,
  cityId: string,
): Promise<{ calibration: CalibrationRow; builtAt: string }> {
  const { rows } = await client.query<CalibrationDbRow>(CALIBRATION_SQL, [cityId]);
  const row = rows[0];
  if (!row) {
    throw new Error(`No calibration for ${cityId}. Run reach:calibrate -- ${cityId} first`);
  }
  if (!isReachMethod(row.method)) {
    throw new Error(
      `The stored calibration for ${cityId} uses method "${row.method}"; only "estimate" or "network" can be published`,
    );
  }
  const checks = typeof row.checks === 'object' && row.checks !== null && !Array.isArray(row.checks) ? row.checks : {};

  return {
    calibration: {
      method: row.method,
      metresPerMinute: row.metres_per_minute,
      kLow: row.k_low,
      kHigh: row.k_high,
      agreement: readAgreement(row.agreement),
      stops: readStops(row.passing_stops),
      sampleSize: row.sample_size,
      checks: checks as Record<string, unknown>,
      calibratedAt: row.computed_at.toISOString(),
    },
    builtAt: row.built_at.toISOString(),
  };
}

async function readCells(client: PoolClient, cityId: string): Promise<CellRow[]> {
  const { rows } = await client.query<{ h3: string; residents: number; outline: string }>(
    'SELECT h3, residents, ST_AsGeoJSON(outline) AS outline FROM reach_cells WHERE city_id = $1 ORDER BY h3',
    [cityId],
  );
  return rows.map((row): CellRow => {
    const outline: unknown = JSON.parse(row.outline);
    if (!isPolygonGeometry(outline)) {
      throw new Error(`Cell ${row.h3} has an outline that is not a Polygon`);
    }
    return {
      h3: row.h3,
      residents: row.residents,
      ring: outline.coordinates[0].map(([lng, lat]): [number, number] => [lng, lat]),
    };
  });
}

async function readNearest(client: PoolClient, cityId: string): Promise<NearestRow[]> {
  const { rows } = await client.query<{ h3: string; need: string; metres: number }>(
    'SELECT h3, need, metres FROM reach_nearest WHERE city_id = $1',
    [cityId],
  );
  return rows.map((row): NearestRow => {
    if (!isNeedId(row.need)) {
      throw new Error(`Cell ${row.h3} has a nearest place for an unknown need "${row.need}"`);
    }
    return { h3: row.h3, need: row.need, metres: row.metres };
  });
}

// The city outline, as build-reach makes it: its districts merged into one
// shape, limited to the names ending in the city's suffix when it has one
// (Tokyo's wards). $1 is the city, $2 the suffix or null.
const OUTLINE_CTE = `
  outline AS (
    SELECT ST_Union(geom) AS geom, count(*)::int AS districts
    FROM districts
    WHERE city_id = $1 AND ($2::text IS NULL OR name LIKE '%' || $2)
  )
`;

// How many parks of the minimum area reach the city, and how many districts
// built the outline, so a city with none is an error rather than zero parks.
// $3 is the minimum area, in square metres.
const PARK_COUNT_SQL = `
  WITH ${OUTLINE_CTE}
  SELECT
    o.districts,
    (
      SELECT count(*)::int
      FROM parks k
      WHERE k.city_id = $1 AND k.area_m2 >= $3 AND ST_Intersects(k.geom, o.geom)
    ) AS parks
  FROM outline o
`;

// How many places of each POI need lie inside the city, in one pass. The needs
// and their categories arrive as parallel arrays, a row per category. $3 is
// the need of each pair, $4 its category. The categories are each need's
// completenessCategories: for the station need, stations and halts only, not
// tram stops or metro entrances (see lib/needs.ts).
const POI_COUNTS_SQL = `
  WITH ${OUTLINE_CTE},
  wanted AS (
    SELECT w.need, w.category FROM unnest($3::text[], $4::text[]) AS w(need, category)
  )
  SELECT w.need, count(*)::int AS places
  FROM wanted w
  JOIN pois p ON p.category = w.category AND p.city_id = $1
  JOIN outline o ON ST_Within(p.geom, o.geom)
  GROUP BY w.need
`;

/** Places per 100,000 residents, to one decimal. */
function per100k(places: number, residents: number): number {
  return Math.round((places * 1_000_000) / residents) / 10;
}

async function readPerHundredThousand(
  client: PoolClient,
  city: CityConfig,
  residents: number,
): Promise<Record<NeedId, number>> {
  if (residents <= 0) {
    throw new Error(`${city.id} has no residents in its cells; run reach:build -- ${city.id} again`);
  }
  const suffix = city.reach.districtNameSuffix ?? null;

  const parkResult = await client.query<{ districts: number; parks: number }>(PARK_COUNT_SQL, [
    city.id,
    suffix,
    PARK_MIN_AREA_M2,
  ]);
  const { districts, parks } = parkResult.rows[0] ?? { districts: 0, parks: 0 };
  if (districts === 0) {
    throw new Error(`No districts found for ${city.id}; run "npm run seed:all" first`);
  }

  // The station need counts stations and halts here, not tram stops or metro
  // entrances: a station has several entrances, so they would inflate the
  // figure. Its nearest-place distances still use all four.
  const needIds: string[] = [];
  const categories: string[] = [];
  for (const need of NEEDS) {
    for (const category of completenessCategories(need)) {
      needIds.push(need.id);
      categories.push(category);
    }
  }
  const poiResult = await client.query<{ need: string; places: number }>(POI_COUNTS_SQL, [
    city.id,
    suffix,
    needIds,
    categories,
  ]);

  const places = new Map<string, number>(poiResult.rows.map((row) => [row.need, row.places]));
  for (const need of NEEDS) {
    if (need.source === 'parks') places.set(need.id, parks);
  }
  const rate = (id: NeedId): number => per100k(places.get(id) ?? 0, residents);

  return { sm: rate('sm'), ph: rate('ph'), dr: rate('dr'), sc: rate('sc'), pk: rate('pk'), st: rate('st') };
}

// built_at is the transaction's now(), which is also what meta.builtAt was read from.
const UPSERT_PAYLOAD_SQL = `
  INSERT INTO reach_payloads (city_id, body, etag, built_at)
  VALUES ($1, $2, $3, now())
  ON CONFLICT (city_id) DO UPDATE SET
    body = EXCLUDED.body,
    etag = EXCLUDED.etag,
    built_at = EXCLUDED.built_at
`;

function count(value: number): string {
  return value.toLocaleString('en-GB');
}

interface Published {
  cells: number;
  residents: number;
  calibration: CalibrationRow;
  perHundredThousand: Record<NeedId, number>;
  info: ReachInfo;
  rawBytes: number;
  compressedBytes: number;
  etag: string;
}

async function publish(client: PoolClient, city: CityConfig): Promise<Published> {
  const { calibration, builtAt } = await readCalibration(client, city.id);

  const cells = await readCells(client, city.id);
  if (cells.length === 0) {
    throw new Error(`No reach cells for ${city.id}. Run reach:build -- ${city.id} first`);
  }
  const nearest = await readNearest(client, city.id);
  const residents = cells.reduce((sum, cell) => sum + cell.residents, 0);

  const info: ReachInfo = {
    city: city.id,
    cityName: city.name,
    coverage: city.reach.coverage,
    builtAt,
    perHundredThousand: await readPerHundredThousand(client, city, residents),
    places: readFetchRecord(path.join(PLACES_DIR, placesRecordName(city.id))),
    parks: readFetchRecord(path.join(DATA_DIR, parksRecordName(city.id))),
    streets:
      calibration.method === 'network'
        ? readFetchRecord(path.join(DATA_DIR, streetsRecordName(city.id)))
        : { fetchedAt: null, osmBase: null },
  };

  const payload = buildReachPayload(cells, nearest, calibration, info);
  const { body, etag } = encodePayload(payload);
  const rawBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');

  await client.query(UPSERT_PAYLOAD_SQL, [city.id, body, etag]);

  return {
    cells: cells.length,
    residents,
    calibration,
    perHundredThousand: info.perHundredThousand,
    info,
    rawBytes,
    compressedBytes: body.length,
    etag,
  };
}

function printReport(city: CityConfig, result: Published): void {
  const { calibration, perHundredThousand } = result;
  console.log(
    `${city.name} (${city.reach.coverage}): ${count(result.cells)} cells, ${count(result.residents)} residents`,
  );
  console.log(`Method: ${calibration.method}`);
  console.log(
    `k = ${calibration.metresPerMinute} m/min (range ${calibration.kLow}-${calibration.kHigh}); ` +
      `the 15-minute band ${cityPasses(calibration.stops) ? 'passes' : 'does not pass'}`,
  );
  console.log(
    'Places per 100,000 residents: ' + NEEDS.map((need) => `${need.id} ${perHundredThousand[need.id]}`).join(', '),
  );
  const { places, parks, streets } = result.info;
  console.log(
    `Sources: places fetched ${places.fetchedAt ?? 'unknown'} (OSM as of ${places.osmBase ?? 'unknown'}), ` +
      `parks fetched ${parks.fetchedAt ?? 'unknown'} (OSM as of ${parks.osmBase ?? 'unknown'}), ` +
      (calibration.method === 'network'
        ? `streets fetched ${streets.fetchedAt ?? 'unknown'} (OSM as of ${streets.osmBase ?? 'unknown'}), `
        : '') +
      `calibrated ${calibration.calibratedAt}`,
  );
  console.log(`Raw: ${count(result.rawBytes)} bytes`);
  console.log(
    `Compressed: ${count(result.compressedBytes)} bytes ` +
      `(${((result.compressedBytes / result.rawBytes) * 100).toFixed(1)}% of raw)`,
  );
  console.log(`ETag: ${result.etag}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) usage();

  const city = CITY_CONFIGS.find((c) => c.id === args[0]);
  if (!city) {
    console.error(`Unknown city: ${args[0]}`);
    usage();
  }

  // This script writes, so it names its target before connecting.
  announceTarget();

  const client = await pool.connect();
  try {
    let result: Published;
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    try {
      result = await publish(client, city);
      await client.query('COMMIT');
    } catch (err) {
      // A failed ROLLBACK must not hide the error that caused it.
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    }
    printReport(city, result);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Publish failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
