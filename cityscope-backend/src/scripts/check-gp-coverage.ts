// Checks London's doctor data against NHS England's list of GP practices.
//
// Everyday reach counts a "doctor" from OpenStreetMap places tagged doctors or
// clinic. If London's OSM data were thin, the reach numbers would understate
// how close doctors are. The NHS practice list is an independent record of
// where GPs really are, so this script asks: of the GP practices inside
// London, how many have a doctors/clinic place within 150 m of them?
//
// 1. Reads the practice list ("epraccur", from NHS England's ODS data
//    service, saved to data/nhs/epraccur.csv) and keeps the active GP
//    practices.
// 2. Finds each practice's location from its postcode with postcodes.io,
//    100 postcodes a request, 200 ms apart. A postcode it does not know (a
//    terminated one, say) leaves its practices "unlocated" and they are left
//    out.
// 3. Keeps the practices that fall inside London's outline (its districts
//    merged), and finds each one's nearest doctors/clinic place in one
//    PostGIS statement (a nearest-neighbour search on the geography index).
// 4. Stores the share within 150 m, and the number of practices it is a
//    share of, in reach_calibration.checks for London.
//
// The stored values reach the published payload when it is rebuilt, so rerun
// "npm run reach:publish -- london" afterwards.
//
// Usage: tsx src/scripts/check-gp-coverage.ts
// Needs London built and calibrated ("npm run reach:build -- london" and
// "npm run reach:calibrate -- london").

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db.js';
import { announceTarget } from '../lib/dbTarget.js';
import { parseGpPractices, percentile, shareWithin } from '../lib/gpCoverage.js';
import type { GpPractice } from '../lib/gpCoverage.js';
import { NEEDS } from '../lib/needs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FILE = path.resolve(__dirname, '../../data/nhs/epraccur.csv');

const CITY_ID = 'london';
const WITHIN_METRES = 150;
/** The places that count as a doctor in Everyday reach. */
const DOCTOR_CATEGORIES: readonly string[] = NEEDS.find((need) => need.id === 'dr')?.categories ?? [];

const LOOKUP_URL = 'https://api.postcodes.io/postcodes';
const LOOKUP_BATCH = 100;
const REQUEST_GAP_MS = 200;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2000;

interface Location {
  lng: number;
  lat: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function count(value: number): string {
  return value.toLocaleString('en-GB');
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Reads one bulk answer: a result for each postcode asked about, in the order
 * asked, each either a place with coordinates or null.
 */
function readLookup(body: unknown, asked: readonly string[]): (Location | null)[] {
  const result = (body as { result?: unknown } | null)?.result;
  if (!Array.isArray(result) || result.length !== asked.length) {
    throw new Error(`postcodes.io answered with ${Array.isArray(result) ? result.length : 'no'} results for ${asked.length} postcodes`);
  }

  return (result as unknown[]).map((entry): Location | null => {
    const place = (entry as { result?: { longitude?: unknown; latitude?: unknown } | null } | null)?.result;
    if (typeof place?.longitude === 'number' && typeof place.latitude === 'number') {
      return { lng: place.longitude, lat: place.latitude };
    }
    return null;
  });
}

/** One bulk request, retried on a rate limit, a server error or a dropped connection. */
async function lookupBatch(postcodes: readonly string[]): Promise<(Location | null)[]> {
  let lastProblem = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(RETRY_DELAY_MS * (attempt - 1));

    let response: Response;
    try {
      response = await fetch(LOOKUP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ postcodes }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (response.ok) return readLookup(await response.json(), postcodes);

    lastProblem = `answered ${response.status}`;
    if (!isRetryable(response.status)) break;
  }
  throw new Error(`postcodes.io request failed: ${lastProblem}`);
}

/** Looks every distinct postcode up, a batch at a time, and keeps the ones it located. */
async function locatePostcodes(postcodes: readonly string[]): Promise<Map<string, Location>> {
  const located = new Map<string, Location>();
  let lastRequestAt = -Infinity;

  for (let start = 0; start < postcodes.length; start += LOOKUP_BATCH) {
    const wait = REQUEST_GAP_MS - (performance.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = performance.now();

    const batch = postcodes.slice(start, start + LOOKUP_BATCH);
    const answers = await lookupBatch(batch);
    batch.forEach((postcode, i) => {
      const location = answers[i];
      if (location) located.set(postcode, location);
    });

    const done = Math.min(start + LOOKUP_BATCH, postcodes.length);
    if ((start / LOOKUP_BATCH) % 10 === 9 || done === postcodes.length) {
      console.log(`  looked up ${count(done)} of ${count(postcodes.length)} postcodes`);
    }
  }
  return located;
}

// Is there anything to check against? A city with no outline or no doctor
// places would otherwise read as "nobody is near a doctor".
const PREFLIGHT_SQL = `
  SELECT
    (SELECT count(*)::int FROM districts WHERE city_id = $1) AS districts,
    (SELECT count(*)::int FROM pois WHERE city_id = $1 AND category = ANY($2::text[])) AS doctor_places
`;

// The practices inside London's outline, each with the distance in metres to
// the nearest doctors/clinic place, in one statement. The practices arrive as
// parallel arrays. The ORDER BY ... <-> is a nearest-neighbour search on the
// geography GiST index; ST_Distance then measures that one place exactly.
// $1 is the city, $2 the practice codes, $3 their longitudes, $4 their
// latitudes and $5 the place categories that count.
const NEAREST_SQL = `
  WITH outline AS (
    SELECT ST_Union(geom) AS geom FROM districts WHERE city_id = $1
  ),
  practices AS (
    SELECT u.code, ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326) AS pt
    FROM unnest($2::text[], $3::float8[], $4::float8[]) AS u(code, lng, lat)
  )
  SELECT p.code, nearest.metres
  FROM practices p
  JOIN outline o ON ST_Within(p.pt, o.geom)
  LEFT JOIN LATERAL (
    SELECT ST_Distance(d.geom::geography, p.pt::geography) AS metres
    FROM pois d
    WHERE d.city_id = $1 AND d.category = ANY($5::text[])
    ORDER BY d.geom::geography <-> p.pt::geography
    LIMIT 1
  ) nearest ON true
  ORDER BY p.code
`;

// `checks ||` merges, so the keys the calibration stored there stay.
const STORE_CHECKS_SQL = `
  UPDATE reach_calibration
  SET checks = checks || jsonb_build_object('londonGpShare', $2::float8, 'londonGpPractices', $3::int)
  WHERE city_id = $1
`;

async function main(): Promise<void> {
  // This script writes, so it names its target before connecting.
  announceTarget();

  const practices = parseGpPractices(await readFile(PRACTICE_FILE, 'utf8'));
  if (practices.length === 0) {
    throw new Error(`No active GP practices in ${PRACTICE_FILE}`);
  }
  const postcodes = [...new Set(practices.map((p) => p.postcode).filter((postcode) => postcode !== ''))];
  console.log(`${count(practices.length)} active GP practices in England, at ${count(postcodes.length)} postcodes`);

  const located = await locatePostcodes(postcodes);
  const locatedPractices: { practice: GpPractice; location: Location }[] = [];
  for (const practice of practices) {
    const location = located.get(practice.postcode);
    if (location) locatedPractices.push({ practice, location });
  }
  const unlocated = practices.length - locatedPractices.length;
  console.log(
    `Located ${count(locatedPractices.length)} practices; ${count(unlocated)} unlocated ` +
      `(${count(postcodes.length - located.size)} distinct postcodes with no position)`,
  );

  const client = await pool.connect();
  try {
    const preflight = await client.query<{ districts: number; doctor_places: number }>(PREFLIGHT_SQL, [
      CITY_ID,
      DOCTOR_CATEGORIES,
    ]);
    const { districts, doctor_places: doctorPlaces } = preflight.rows[0] ?? { districts: 0, doctor_places: 0 };
    if (districts === 0) {
      throw new Error(`No districts for ${CITY_ID}; run "npm run seed:all" first`);
    }
    if (doctorPlaces === 0) {
      throw new Error(`No ${DOCTOR_CATEGORIES.join(' or ')} places for ${CITY_ID}`);
    }

    const { rows } = await client.query<{ code: string; metres: number | null }>(NEAREST_SQL, [
      CITY_ID,
      locatedPractices.map((p) => p.practice.code),
      locatedPractices.map((p) => p.location.lng),
      locatedPractices.map((p) => p.location.lat),
      DOCTOR_CATEGORIES,
    ]);
    if (rows.length === 0) {
      throw new Error('No located practice falls inside London; check the outline and the practice file');
    }

    const distances = rows.map((row) => {
      if (row.metres === null) throw new Error(`Practice ${row.code} has no nearest doctor place`);
      return row.metres;
    });
    const share = shareWithin(distances, WITHIN_METRES);
    // Three decimals is a tenth of a percentage point.
    const stored = Math.round(share * 1000) / 1000;

    const update = await client.query(STORE_CHECKS_SQL, [CITY_ID, stored, distances.length]);
    if (update.rowCount !== 1) {
      throw new Error(`No calibration for ${CITY_ID} to store the check on; run reach:calibrate -- ${CITY_ID} first`);
    }

    const within = distances.filter((d) => d <= WITHIN_METRES).length;
    console.log('');
    console.log(`Practices inside London: ${count(distances.length)}`);
    console.log(
      `Nearest ${DOCTOR_CATEGORIES.join('/')} place: median ${Math.round(percentile(distances, 0.5))} m, ` +
        `90th percentile ${Math.round(percentile(distances, 0.9))} m, ` +
        `farthest ${Math.round(Math.max(...distances))} m`,
    );
    console.log(
      `Within ${WITHIN_METRES} m: ${count(within)} of ${count(distances.length)} = ${(share * 100).toFixed(1)}%`,
    );
    console.log(`Stored londonGpShare ${stored} and londonGpPractices ${distances.length} in reach_calibration.checks`);
    console.log('');
    console.log(`Now rerun: npm run reach:publish -- ${CITY_ID}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('GP coverage check failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
