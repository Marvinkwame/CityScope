import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_CONFIGS } from '../config/cities.js';

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

const CATEGORY_TAGS = ['amenity', 'tourism', 'leisure', 'shop', 'public_transport'] as const;

function extractCategory(tags: Record<string, string>): string | null {
  for (const key of CATEGORY_TAGS) {
    if (tags[key]) return tags[key];
  }
  return null;
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

  const { south, west, north, east } = cityConfig.bounds;
  const bbox = `${south},${west},${north},${east}`;

  const query = `
    [out:json][timeout:120];
    (
      node["amenity"~"cafe|restaurant|bar|pub"](${bbox});
      node["tourism"~"museum|hotel|attraction"](${bbox});
      node["leisure"~"park|playground"](${bbox});
      node["shop"~"supermarket|bakery"](${bbox});
    );
    out center 5000;
  `;

  console.log(`Fetching POIs for ${cityConfig.name} from Overpass API...`);

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API returned ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as OverpassResponse;
  console.log(`Received ${data.elements.length} elements from Overpass API`);

  const pois: Poi[] = [];

  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const tags = el.tags ?? {};
    const category = extractCategory(tags);
    if (!category) continue;

    pois.push({
      name: tags.name ?? null,
      category,
      lat,
      lng: lon,
    });
  }

  const outputPath = path.resolve(__dirname, `pois-data-${cityId}.json`);
  writeFileSync(outputPath, JSON.stringify(pois, null, 2));
  console.log(`Saved ${pois.length} POIs to ${outputPath}`);
}

fetchPois().catch((err) => {
  console.error('Fetch failed:', err);
  process.exit(1);
});
