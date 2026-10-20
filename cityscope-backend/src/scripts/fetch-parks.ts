import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_CONFIGS } from '../config/cities.js';
import { overpassFetch } from '../lib/overpass.js';
import { buildParkQuery, parksFromOverpass } from '../lib/parks.js';
import { osmBaseOf, parksRecordName, writeFetchRecord } from '../lib/sourceDates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The downloads sit in cityscope-backend/data/, which git ignores.
const DATA_DIR = path.resolve(__dirname, '../../data');

async function fetchParks() {
  const cityId = process.argv[2];
  if (!cityId) {
    console.error('Usage: tsx fetch-parks.ts <cityId>');
    console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const cityConfig = CITY_CONFIGS.find((c) => c.id === cityId);
  if (!cityConfig) {
    console.error(`Unknown city: ${cityId}`);
    process.exit(1);
  }

  // The city's outline plus a 2 km margin, so a park just over the edge still
  // counts for the blocks beside it.
  const { south, west, north, east } = cityConfig.fetchBounds;
  const query = buildParkQuery(`${south},${west},${north},${east}`);

  console.log(`Fetching parks for ${cityConfig.name} from Overpass API...`);

  const data = await overpassFetch(query);
  const fetchedAt = new Date().toISOString();
  const osmBase = osmBaseOf(data);
  const elements = (data as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) {
    throw new Error('Overpass response has no elements array');
  }
  console.log(`Received ${elements.length} elements from Overpass API (OSM data as of ${osmBase ?? 'an unstated time'})`);

  const parks = parksFromOverpass(data);

  const collection = {
    type: 'FeatureCollection',
    features: parks.map((park) => ({
      type: 'Feature',
      id: park.osmId,
      properties: { osmId: park.osmId, name: park.name },
      geometry: park.geometry,
    })),
  };

  mkdirSync(DATA_DIR, { recursive: true });
  const outputPath = path.join(DATA_DIR, `parks-${cityId}.json`);
  writeFileSync(outputPath, JSON.stringify(collection));
  console.log(
    `Saved ${parks.length} parks to ${outputPath} (${elements.length - parks.length} elements dropped: unclosed outlines, nodes and non-polygons)`,
  );

  // When the parks were fetched, and the OSM database state they come from,
  // beside the parks file (git-ignored with it); reach:publish puts both into
  // meta.sources.
  const recordPath = path.join(DATA_DIR, parksRecordName(cityId));
  writeFetchRecord(recordPath, fetchedAt, osmBase);
  console.log(`Recorded the fetch time in ${recordPath}`);
}

fetchParks().catch((err) => {
  console.error('Fetch failed:', err);
  process.exit(1);
});
