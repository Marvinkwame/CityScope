import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_CONFIGS } from '../config/cities.js';
import { overpassFetch } from '../lib/overpass.js';
import { osmBaseOf, streetsRecordName, writeFetchRecord } from '../lib/sourceDates.js';
import { StreetsCollector, buildStreetQuery, isOverpassDate, tilesOf } from '../lib/streets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The downloads sit in cityscope-backend/data/, which git ignores.
const DATA_DIR = path.resolve(__dirname, '../../data');

const DEFAULT_TILE_DEGREES = 0.1;
const PAUSE_BETWEEN_TILES_MS = 5_000;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage(): never {
  console.error('Usage: tsx fetch-streets.ts <cityId> [--tile <degrees>] [--date <YYYY-MM-DDTHH:MM:SSZ>]');
  console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
  process.exit(1);
}

async function fetchStreets() {
  const args = process.argv.slice(2);
  const cityId = args[0];
  if (!cityId || cityId.startsWith('--')) usage();

  let tileDegrees = DEFAULT_TILE_DEGREES;
  const tileFlag = args.indexOf('--tile');
  if (tileFlag !== -1) {
    tileDegrees = Number(args[tileFlag + 1]);
    if (!(tileDegrees > 0)) {
      console.error('--tile needs a positive number of degrees');
      process.exit(1);
    }
  }

  let date: string | undefined;
  const dateFlag = args.indexOf('--date');
  if (dateFlag !== -1) {
    date = args[dateFlag + 1];
    if (date === undefined || !isOverpassDate(date)) {
      console.error('--date needs a UTC time like 2026-11-21T02:08:48Z');
      process.exit(1);
    }
  }

  const cityConfig = CITY_CONFIGS.find((c) => c.id === cityId);
  if (!cityConfig) {
    console.error(`Unknown city: ${cityId}`);
    process.exit(1);
  }

  // The city's outline plus a 2 km margin, so a walk can start in a block at the
  // edge and use streets just beyond it.
  const tiles = tilesOf(cityConfig.fetchBounds, tileDegrees);
  console.log(
    `Fetching streets for ${cityConfig.name} from Overpass API: ${tiles.length} tiles of ${tileDegrees} degrees${date ? ` as of ${date}` : ''}...`,
  );

  const collector = new StreetsCollector();
  let fetchedAt = new Date().toISOString();
  // A dated download is the map as of that date; otherwise Overpass's own base is the server's current state.
  let osmBase: string | null = date ?? null;
  let areaTotal = 0;
  let privateTotal = 0;

  for (const [i, tile] of tiles.entries()) {
    if (i > 0) await pause(PAUSE_BETWEEN_TILES_MS);
    const data = await overpassFetch(buildStreetQuery(tile, date));
    fetchedAt = new Date().toISOString();
    const base = osmBaseOf(data);
    // ISO 8601 timestamps in one format sort as text; keep the oldest.
    if (date === undefined && base !== null && (osmBase === null || base < osmBase)) osmBase = base;
    const { ways, kept, areas, footPrivate } = collector.addOverpassAnswer(data);
    areaTotal += areas;
    privateTotal += footPrivate;
    console.log(
      `Tile ${i + 1}/${tiles.length}: ${ways} ways, ${kept} kept, ${areas} areas, ${footPrivate} foot=private dropped`,
    );
  }

  const file = collector.toFile();
  if (file.ways.length === 0) {
    throw new Error(`No walkable ways found for ${cityConfig.name}; refusing to write an empty network`);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const outputPath = path.join(DATA_DIR, `streets-${cityId}.json`);
  writeFileSync(outputPath, JSON.stringify(file));
  console.log(`Saved ${file.ways.length} ways and ${file.nodeCount} nodes to ${outputPath}`);
  console.log(`${areaTotal} walkable areas, ${privateTotal} foot=private ways dropped`);

  // When the streets were fetched, and the OSM database state they come from,
  // beside the streets file (git-ignored with it).
  const recordPath = path.join(DATA_DIR, streetsRecordName(cityId));
  writeFetchRecord(recordPath, fetchedAt, osmBase);
  console.log(`Recorded the fetch time in ${recordPath} (OSM data as of ${osmBase ?? 'an unstated time'})`);
}

fetchStreets().catch((err) => {
  console.error('Fetch failed:', err);
  process.exit(1);
});
