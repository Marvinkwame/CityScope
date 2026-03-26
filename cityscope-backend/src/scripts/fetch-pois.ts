import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, 'pois-data.json');

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
  const query = `
    [out:json][timeout:120];
    (
      node["amenity"~"cafe|restaurant|bar|pub"](52.34,13.08,52.68,13.76);
      node["tourism"~"museum|hotel|attraction"](52.34,13.08,52.68,13.76);
      node["leisure"~"park|playground"](52.34,13.08,52.68,13.76);
      node["shop"~"supermarket|bakery"](52.34,13.08,52.68,13.76);
    );
    out center 5000;
  `;

  console.log('Fetching POIs from Overpass API...');

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

  writeFileSync(outputPath, JSON.stringify(pois, null, 2));
  console.log(`Saved ${pois.length} POIs to ${outputPath}`);
}

fetchPois().catch((err) => {
  console.error('Fetch failed:', err);
  process.exit(1);
});
