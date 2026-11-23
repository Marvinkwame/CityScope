// Calibrates one city's walking estimate against Mapbox walking isochrones.
//
// Everyday reach estimates a walk as metres / k, on the metres the city was
// built with (along the streets, or in a straight line). This script fits k for
// the city, and says how far the estimate can be trusted:
//
// 1. Samples 60 of the city's populated cells, weighted by residents, with a
//    fixed seed.
// 2. For each sampled cell, asks Mapbox for the 5, 10, 15 and 20 minute walking
//    isochrones from the cell centre, and checks in PostGIS whether each
//    need's nearest place lies inside each of them.
// 3. Deals the sample into two halves of 30, alternately (see splitSample).
//    k_fit is fitted on one half; agreement is reported on the other, held out,
//    with k_fit fixed, so it is not graded on its own fit.
// 4. The k that is published is fitted on all 60 cells, and the range around it
//    is a bootstrap over all 60 cells, widened if need be to contain it.
// 5. Reports each band's base rate beside its agreement: the share of held-out
//    checks whose place is inside at all, which is what a predictor that always
//    says "inside" would score.
// 6. Stores the result in reach_calibration (the base rates go into `checks`,
//    under calibrationBaseline) and drops the city's published payload, which
//    was built without it.
//
// Whatever the agreement turns out to be is reported as it is; nothing here is
// tuned to pass the bar.
//
// Mapbox's answers are cached on disk, one file per cell, in
// cityscope-backend/data/isochrones/<cityId>/ (git-ignored; see
// lib/isochroneCache.ts). Only the sampled cells without a cached answer are
// requested, so a rerun on the same cells makes no requests at all.
//
// Usage: tsx src/scripts/calibrate-reach.ts <cityId>
// Needs a city that "npm run reach:build -- <cityId>" has already built, and
// MAPBOX_TOKEN in the environment (or the dotenv file) whenever a sampled cell
// has no cached answer. At most 60 requests, 250 ms apart.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { CITY_CONFIGS } from '../config/cities.js';
import pool from '../db.js';
import {
  AGREEMENT_BAR,
  BANDS,
  BOOTSTRAP_ROUNDS,
  CALIBRATION_SAMPLE,
  CALIBRATION_SEED,
  agreementByBand,
  baselineByBand,
  bootstrapK,
  cityPasses,
  coherentRange,
  fitK,
  passingStops,
  predictsInside,
  splitSample,
} from '../lib/calibration.js';
import type { Band, BandBaseline, Observation } from '../lib/calibration.js';
import { announceTarget } from '../lib/dbTarget.js';
import { isAreaGeometry } from '../lib/geometry.js';
import type { ContourInput } from '../lib/geometry.js';
import { readCachedIsochrone, writeCachedIsochrone } from '../lib/isochroneCache.js';
import type { IsochroneRequest } from '../lib/isochroneCache.js';
import { methodOfRows } from '../lib/reachMethod.js';
import type { ReachMethod } from '../lib/reachMethod.js';
import { weightedSample } from '../lib/sampling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// cityscope-backend/data/ is git-ignored.
const CACHE_DIR = path.resolve(__dirname, '../../data/isochrones');

const ISOCHRONE_URL = 'https://api.mapbox.com/isochrone/v1/mapbox/walking';
const REQUEST_GAP_MS = 250;
const WORST_CELLS_SHOWN = 10;

/** Simplification off: by default Mapbox simplifies a 5-minute area to about 10 points. */
const GENERALIZE = 0;

interface Cell {
  h3: string;
  residents: number;
  lng: number;
  lat: number;
}

function usage(): never {
  console.error('Usage: tsx src/scripts/calibrate-reach.ts <cityId>');
  console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
  process.exit(1);
}

function isBand(value: number): value is Band {
  return (BANDS as readonly number[]).includes(value);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const CELLS_SQL = `
  SELECT h3, residents, ST_X(centre) AS lng, ST_Y(centre) AS lat
  FROM reach_cells
  WHERE city_id = $1
  ORDER BY h3
`;

async function readCells(client: PoolClient, cityId: string): Promise<Cell[]> {
  const { rows } = await client.query<Cell>(CELLS_SQL, [cityId]);
  return rows;
}

// Mapbox's four contours arrive as JSON, so they are joined to the cell's
// nearest places as one jsonb array: a row per (need, band) saying whether the
// band polygon touches the place. The place is the POI point or the park shape.
// ST_MakeValid guards the intersection against a self-touching polygon, which
// a request with generalize=0 can return. $1 city, $2 contours, $3 cell.
const CHECKS_SQL = `
  WITH bands AS (
    SELECT
      (b->>'contour')::int AS band,
      ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON((b->'geometry')::text), 4326)) AS geom
    FROM jsonb_array_elements($2::jsonb) AS b
  )
  SELECT
    n.need,
    bands.band,
    n.metres,
    ST_Intersects(bands.geom, COALESCE(p.geom, k.geom)) AS inside
  FROM reach_nearest n
  LEFT JOIN pois p ON n.place_kind = 'poi' AND p.id = n.place_id
  LEFT JOIN parks k ON n.place_kind = 'park' AND k.id = n.place_id
  CROSS JOIN bands
  WHERE n.city_id = $1 AND n.h3 = $3
  ORDER BY n.need, bands.band
`;

interface CheckRow {
  need: string;
  band: number;
  metres: number;
  inside: boolean | null;
}

async function observationsForCell(
  client: PoolClient,
  cityId: string,
  h3: string,
  contours: readonly ContourInput[],
): Promise<Observation[]> {
  const { rows } = await client.query<CheckRow>(CHECKS_SQL, [cityId, JSON.stringify(contours), h3]);

  return rows.map((row) => {
    if (!isBand(row.band)) {
      throw new Error(`Unexpected band ${row.band} for cell ${h3}`);
    }
    // reach_nearest keeps no foreign key to the places, so a reload of the
    // place data can leave it pointing at nothing. Say so, rather than guess.
    if (row.inside === null) {
      throw new Error(
        `Cell ${h3}, need ${row.need}: its nearest place no longer exists. ` +
          `Run reach:build -- ${cityId} again.`,
      );
    }
    return { cell: h3, need: row.need, band: row.band, metres: row.metres, inside: row.inside };
  });
}

/** Checks one Mapbox response is the four polygon contours that were asked for. */
function readContours(body: unknown): ContourInput[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) {
    throw new Error('Mapbox answered without a features list');
  }

  const byBand = new Map<number, ContourInput>();
  for (const feature of features as unknown[]) {
    const { properties, geometry } = (feature ?? {}) as { properties?: { contour?: unknown }; geometry?: unknown };
    const contour = properties?.contour;
    if (typeof contour === 'number' && isBand(contour) && isAreaGeometry(geometry)) {
      byBand.set(contour, { contour, geometry });
    }
  }

  const missing = BANDS.filter((band) => !byBand.has(band));
  if (missing.length > 0) {
    throw new Error(`Mapbox answered without a polygon for the ${missing.join(', ')} minute contour`);
  }
  return BANDS.map((band) => byBand.get(band) as ContourInput);
}

/** What is asked of Mapbox for a cell: the same question on every run. */
function isochroneRequest(cell: Cell): IsochroneRequest {
  return { lng: cell.lng.toFixed(6), lat: cell.lat.toFixed(6), contoursMinutes: BANDS, generalize: GENERALIZE };
}

// The token is in the request URL, so the URL is never printed or put in an
// error message. Returns the response body as it arrived, for the cache.
async function fetchIsochrone(cell: Cell, request: IsochroneRequest, token: string): Promise<unknown> {
  const url =
    `${ISOCHRONE_URL}/${request.lng},${request.lat}` +
    `?contours_minutes=${request.contoursMinutes.join(',')}&polygons=true&generalize=${request.generalize}` +
    `&access_token=${encodeURIComponent(token)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Mapbox request failed for cell ${cell.h3}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`Mapbox answered ${response.status} for cell ${cell.h3}${detail ? `: ${detail}` : ''}`);
  }
  const body: unknown = await response.json();
  return body;
}

// The base rates go into `checks` under their own key, merged with `||`, so
// the other keys there (London's GP check) survive a recalibration. $8 is the
// base rates by band, $9 the method the nearest places were built with.
const UPSERT_CALIBRATION_SQL = `
  INSERT INTO reach_calibration
    (city_id, method, metres_per_minute, k_low, k_high, agreement, passing_stops, sample_size, checks)
  VALUES ($1, $9, $2, $3, $4, $5::jsonb, $6::int[], $7, jsonb_build_object('calibrationBaseline', $8::jsonb))
  ON CONFLICT (city_id) DO UPDATE SET
    method = EXCLUDED.method,
    metres_per_minute = EXCLUDED.metres_per_minute,
    k_low = EXCLUDED.k_low,
    k_high = EXCLUDED.k_high,
    agreement = EXCLUDED.agreement,
    passing_stops = EXCLUDED.passing_stops,
    sample_size = EXCLUDED.sample_size,
    checks = reach_calibration.checks || jsonb_build_object('calibrationBaseline', $8::jsonb),
    computed_at = now()
`;

interface Calibration {
  /** How the stored metres were measured. */
  method: ReachMethod;
  /** The k fitted on the fit half alone: the one the held-out agreement is graded at. */
  kFit: number;
  /** The k that is published, fitted on every sampled cell. */
  k: number;
  kLow: number;
  kHigh: number;
  byBand: Record<Band, number>;
  /** The held-out base rate of each band, to read the agreement against. */
  baseline: Record<Band, BandBaseline>;
  stops: Band[];
  sampleSize: number;
}

// `checks` is merged, never replaced: reach:check-gp stores London's GP check
// there, and a recalibration must not wipe it.
async function storeCalibration(client: PoolClient, cityId: string, result: Calibration): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(UPSERT_CALIBRATION_SQL, [
      cityId,
      result.k,
      result.kLow,
      result.kHigh,
      JSON.stringify(result.byBand),
      result.stops,
      result.sampleSize,
      JSON.stringify(result.baseline),
      result.method,
    ]);
    // The published payload was built without this calibration.
    await client.query('DELETE FROM reach_payloads WHERE city_id = $1', [cityId]);
    await client.query('COMMIT');
  } catch (err) {
    // A failed ROLLBACK must not hide the error that caused it.
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

function pad(text: string, width: number): string {
  return text.padEnd(width);
}

function printReport(
  cityName: string,
  result: Calibration,
  heldOut: readonly Observation[],
  heldOutCells: readonly Cell[],
): void {
  const { kFit, k, kLow, kHigh, byBand, baseline, stops } = result;

  console.log('');
  console.log(
    result.method === 'network'
      ? `${cityName}: walking time = street metres / k`
      : `${cityName}: walking estimate = straight-line metres / k`,
  );
  console.log(`k_fit = ${kFit} m/min (fitted on the ${result.sampleSize - heldOutCells.length} fit cells)`);
  console.log(
    `k = ${k} m/min, published (fitted on all ${result.sampleSize} cells; ` +
      `bootstrap range ${kLow}-${kHigh}, ${BOOTSTRAP_ROUNDS} rounds)`,
  );
  console.log('');
  console.log(`Agreement at k_fit on the ${heldOutCells.length} held-out cells (bar ${AGREEMENT_BAR}),`);
  console.log('beside the base rate: the share inside at all, which always answering "inside" would score:');
  for (const band of BANDS) {
    const checks = heldOut.filter((o) => o.band === band).length;
    const { insideShare, alwaysInsideAgreement } = baseline[band];
    console.log(
      `  ${pad(`${band} min`, 8)}${byBand[band].toFixed(3)}  ${pad(`(${checks} checks)`, 14)}` +
        `${pad(stops.includes(band) ? 'pass' : 'fail', 6)}` +
        `base rate ${insideShare.toFixed(3)} (always inside agrees ${alwaysInsideAgreement.toFixed(3)})`,
    );
  }
  console.log('');
  console.log(cityPasses(stops) ? 'PASS: the 15-minute band clears the bar' : 'FAIL: the 15-minute band is below the bar');

  // The held-out cells the estimate gets most wrong at k_fit, the k the
  // agreement above was graded at, so a failure can be looked at on a map
  // rather than only counted.
  const wrong = new Map<string, Observation[]>();
  for (const o of heldOut) {
    if (predictsInside(o.metres, kFit, o.band) !== o.inside) {
      const list = wrong.get(o.cell);
      if (list) list.push(o);
      else wrong.set(o.cell, [o]);
    }
  }
  const centres = new Map(heldOutCells.map((c) => [c.h3, c]));
  const worst = [...wrong.entries()]
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))
    .slice(0, WORST_CELLS_SHOWN);

  console.log('');
  if (worst.length === 0) {
    console.log('No held-out cell was misclassified.');
    return;
  }
  console.log(`Held-out cells with the most misclassifications (top ${worst.length} of ${wrong.size}):`);
  for (const [h3, list] of worst) {
    const cell = centres.get(h3);
    const byNeed = new Map<string, number[]>();
    for (const o of list) {
      const bands = byNeed.get(o.need);
      if (bands) bands.push(o.band);
      else byNeed.set(o.need, [o.band]);
    }
    const which = [...byNeed].map(([need, bands]) => `${need}@${bands.join(',')}`).join(' ');
    const where = cell ? `(${cell.lat.toFixed(5)}, ${cell.lng.toFixed(5)})` : '(unknown centre)';
    console.log(`  ${h3} ${where}  ${list.length} wrong  ${which}`);
  }
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

  const token = process.env.MAPBOX_TOKEN?.trim() ?? '';

  const client = await pool.connect();
  try {
    const cells = await readCells(client, city.id);
    if (cells.length === 0) {
      throw new Error(`No reach cells for ${city.id}. Run reach:build -- ${city.id} first`);
    }

    const methodRows = await client.query<{ method: string }>(
      'SELECT DISTINCT method FROM reach_nearest WHERE city_id = $1',
      [city.id],
    );
    const method = methodOfRows(methodRows.rows.map((row) => row.method));

    const chosen = weightedSample(
      cells.map((c) => ({ id: c.h3, weight: c.residents })),
      CALIBRATION_SAMPLE,
      CALIBRATION_SEED,
    );
    if (chosen.length < CALIBRATION_SAMPLE) {
      throw new Error(`${city.id} has only ${chosen.length} populated cells; ${CALIBRATION_SAMPLE} are needed`);
    }
    const byH3 = new Map(cells.map((c) => [c.h3, c]));
    const sample = chosen.map((h3) => byH3.get(h3) as Cell);

    console.log(`${city.name} (${city.reach.coverage}): ${cells.length.toLocaleString('en-GB')} cells, sampling ${sample.length}`);

    const { heldOut: heldOutCells } = splitSample(sample);
    const heldOutH3 = new Set(heldOutCells.map((c) => c.h3));

    // Which sampled cells already have Mapbox's answer on disk. The token is
    // only needed for the rest.
    const cacheDir = path.join(CACHE_DIR, city.id);
    const cached = new Map<string, unknown>();
    for (const cell of sample) {
      const response = readCachedIsochrone(CACHE_DIR, city.id, cell.h3, isochroneRequest(cell));
      if (response !== null) cached.set(cell.h3, response);
    }
    const toRequest = sample.length - cached.size;
    console.log(`Mapbox cache (${cacheDir}): ${cached.size} of ${sample.length} cells cached, ${toRequest} to request`);
    if (toRequest > 0 && !token) {
      throw new Error(
        `Set MAPBOX_TOKEN in the environment (or the dotenv file): ${toRequest} sampled cells have no cached isochrone`,
      );
    }

    const allObs: Observation[] = [];
    const fitObs: Observation[] = [];
    const heldOutObs: Observation[] = [];
    let lastRequestAt = -Infinity;
    let requests = 0;

    for (const [i, cell] of sample.entries()) {
      const request = isochroneRequest(cell);
      const fromCache = cached.has(cell.h3);
      let contours: ContourInput[];
      if (fromCache) {
        try {
          contours = readContours(cached.get(cell.h3));
        } catch (err) {
          throw new Error(
            `${err instanceof Error ? err.message : String(err)} (cached for cell ${cell.h3} in ${cacheDir}; ` +
              'delete that file and run again)',
          );
        }
      } else {
        const wait = REQUEST_GAP_MS - (performance.now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
        lastRequestAt = performance.now();

        const response = await fetchIsochrone(cell, request, token);
        requests++;
        // Checked before it is kept, so the cache only ever holds usable answers.
        contours = readContours(response);
        writeCachedIsochrone(CACHE_DIR, city.id, cell.h3, request, response, new Date().toISOString());
      }

      const observations = await observationsForCell(client, city.id, cell.h3, contours);
      const isHeldOut = heldOutH3.has(cell.h3);
      allObs.push(...observations);
      (isHeldOut ? heldOutObs : fitObs).push(...observations);

      console.log(
        `  ${String(i + 1).padStart(2)}/${sample.length} ${cell.h3} ` +
          `${isHeldOut ? 'held out' : 'fit'}: ${observations.length} checks (${fromCache ? 'cached' : 'Mapbox'})`,
      );
    }
    console.log(
      `Mapbox cache: ${cached.size} hits, ${sample.length - cached.size} misses; ${requests} Mapbox requests made`,
    );

    if (fitObs.length === 0 || heldOutObs.length === 0) {
      throw new Error(`${city.id}: the sampled cells have no nearest places to check; run reach:build -- ${city.id} again`);
    }

    // Held-out agreement is graded at the k fitted without those cells. The k
    // that is published uses every cell, since that is the better estimate.
    const kFit = fitK(fitObs);
    const byBand = agreementByBand(heldOutObs, kFit);
    const k = fitK(allObs);

    const bootstrap = bootstrapK(allObs, BOOTSTRAP_ROUNDS, CALIBRATION_SEED);
    const { kLow, kHigh } = coherentRange(k, bootstrap);
    if (kLow !== bootstrap.kLow || kHigh !== bootstrap.kHigh) {
      console.log(
        `Widened the bootstrap range ${bootstrap.kLow}-${bootstrap.kHigh} to ${kLow}-${kHigh} ` +
          `so that it contains the published k ${k}`,
      );
    }

    const result: Calibration = {
      method,
      kFit,
      k,
      kLow,
      kHigh,
      byBand,
      baseline: baselineByBand(heldOutObs),
      stops: passingStops(byBand),
      sampleSize: sample.length,
    };

    await storeCalibration(client, city.id, result);
    printReport(city.name, result, heldOutObs, heldOutCells);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Calibration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
