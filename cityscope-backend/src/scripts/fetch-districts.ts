import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '../../../cityscope/public/data');

interface CityDistrictSource {
  url: string;
  nameProperty: string;
}

// Direct GeoJSON/API URLs from open data portals
const SOURCES: Record<string, CityDistrictSource> = {
  london: {
    url: 'https://data.london.gov.uk/download/london-borough-profiles/c1693b82-68b1-44ee-bede-f762f8e20f2f/london_boroughs.geojson',
    nameProperty: 'name',
  },
  paris: {
    url: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson',
    nameProperty: 'l_ar',
  },
  'new-york': {
    url: 'https://data.cityofnewyork.us/api/geospatial/7t3b-ywvw?method=export&type=GeoJSON',
    nameProperty: 'boro_name',
  },
  tokyo: {
    // Tokyo wards from OSM-derived source
    url: 'https://raw.githubusercontent.com/dataofjapan/land/master/tokyo.geojson',
    nameProperty: 'ward_en',
  },
  amsterdam: {
    url: 'https://maps.amsterdam.nl/open_geodata/geojson_lnglat.php?KAARTLAAG=INDELING_STADSDEEL&THEMA=gebiedsindeling',
    nameProperty: 'Stadsdeel',
  },
  munich: {
    // Munich city districts from OSM Overpass (simplified query)
    url: '',
    nameProperty: 'name',
  },
  sydney: {
    // Sydney LGAs - using a simplified approach
    url: '',
    nameProperty: 'name',
  },
};

function simplifyCoords(coords: unknown): unknown {
  if (Array.isArray(coords)) {
    if (typeof coords[0] === 'number') {
      return [
        Math.round((coords[0] as number) * 10000) / 10000,
        Math.round((coords[1] as number) * 10000) / 10000,
      ];
    }
    return coords.map(simplifyCoords);
  }
  return coords;
}

function reduceRingPoints(ring: number[][], keepEvery: number): number[][] {
  if (ring.length <= 4) return ring;
  const result = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    if (i % keepEvery === 0) result.push(ring[i]);
  }
  result.push(ring[ring.length - 1]);
  return result;
}

function simplifyGeometry(geom: { type: string; coordinates: unknown }): { type: string; coordinates: unknown } {
  const simplified = simplifyCoords(geom.coordinates);

  if (geom.type === 'Polygon') {
    const coords = simplified as number[][][];
    return {
      type: 'Polygon',
      coordinates: coords.map((ring) => reduceRingPoints(ring, 3)),
    };
  }
  if (geom.type === 'MultiPolygon') {
    const coords = simplified as number[][][][];
    return {
      type: 'MultiPolygon',
      coordinates: coords.map((polygon) =>
        polygon.map((ring) => reduceRingPoints(ring, 3)),
      ),
    };
  }
  return { type: geom.type, coordinates: simplified };
}

interface GeoJSONFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

async function fetchAndSave(cityId: string) {
  const source = SOURCES[cityId];
  if (!source || !source.url) {
    console.log(`  ${cityId}: No direct URL available, skipping`);
    return;
  }

  const outputPath = path.resolve(outputDir, `${cityId}-districts.geojson`);
  if (existsSync(outputPath)) {
    console.log(`  ${cityId}: Already exists, skipping`);
    return;
  }

  console.log(`  ${cityId}: Downloading...`);

  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'CityScope/1.0' },
  });

  if (!res.ok) {
    console.error(`  ${cityId}: HTTP ${res.status} ${res.statusText}`);
    return;
  }

  const data = (await res.json()) as GeoJSONCollection;

  const features = data.features.map((f) => ({
    type: 'Feature' as const,
    properties: {
      name: String(
        f.properties[source.nameProperty] ??
        f.properties.name ??
        f.properties.Name ??
        f.properties.NAME ??
        'Unknown',
      ),
    },
    geometry: simplifyGeometry(f.geometry),
  }));

  const geojson = { type: 'FeatureCollection', features };
  const output = JSON.stringify(geojson);
  writeFileSync(outputPath, output);
  console.log(`  ${cityId}: Saved ${features.length} districts (${(output.length / 1024).toFixed(1)}KB)`);
}

async function main() {
  const cityId = process.argv[2];

  if (cityId) {
    await fetchAndSave(cityId);
  } else {
    console.log('Fetching districts for all cities...');
    for (const id of Object.keys(SOURCES)) {
      try {
        await fetchAndSave(id);
      } catch (err) {
        console.error(`  ${id}: Failed -`, err);
      }
    }
  }
}

main().catch((err) => {
  console.error('Fetch districts failed:', err);
  process.exit(1);
});
