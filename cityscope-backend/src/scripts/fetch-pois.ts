import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_CONFIGS } from '../config/cities.js';
import { overpassFetch } from '../lib/overpass.js';
import { buildOverpassQuery, classifyPoi } from '../lib/poiCategories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface Poi {
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

async function fetchPois() {
  const cityId = process.argv[2];
  if (!cityId) {
    console.error('Usage: tsx fetch-pois.ts <cityId>');
    console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const cityConfig = CITY_CONFIGS.find((c) => c.id === cityId);
  if (!cityConfig) {
    console.error(`Unknown city: ${cityId}`);
    process.exit(1);
  }

  const { south, west, north, east } = cityConfig.fetchBounds;
  const bbox = `${south},${west},${north},${east}`;

  const query = buildOverpassQuery(bbox);

  console.log(`Fetching POIs for ${cityConfig.name} from Overpass API...`);

  const data = (await overpassFetch(query)) as OverpassResponse;
  console.log(`Received ${data.elements.length} elements from Overpass API`);

  const pois: Poi[] = [];
  let rejected = 0;

  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const tags = el.tags ?? {};
    const category = classifyPoi(tags);
    if (!category) {
      rejected += 1;
      continue;
    }

    pois.push({
      name: tags.name ?? null,
      category,
      lat,
      lng: lon,
    });
  }

  const outputPath = path.resolve(__dirname, `pois-data-${cityId}.json`);
  writeFileSync(outputPath, JSON.stringify(pois, null, 2));
  console.log(`Saved ${pois.length} POIs to ${outputPath} (${rejected} elements rejected by classifyPoi)`);
}

fetchPois().catch((err) => {
  console.error('Fetch failed:', err);
  process.exit(1);
});
