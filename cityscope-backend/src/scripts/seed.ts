import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';
import { CITY_CONFIGS } from '../config/cities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Feature {
  type: string;
  properties: Record<string, string>;
  geometry: object;
}

interface FeatureCollection {
  type: string;
  features: Feature[];
}

async function seed() {
  const cityId = process.argv[2];
  if (!cityId) {
    console.error('Usage: tsx seed.ts <cityId>');
    console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const cityConfig = CITY_CONFIGS.find((c) => c.id === cityId);
  if (!cityConfig) {
    console.error(`Unknown city: ${cityId}`);
    console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const geojsonPath = path.resolve(
    __dirname,
    `../../../cityscope/public/data/${cityId}-districts.geojson`,
  );

  let raw: string;
  try {
    raw = readFileSync(geojsonPath, 'utf-8');
  } catch {
    console.error(`GeoJSON file not found: ${geojsonPath}`);
    process.exit(1);
  }

  const geojson: FeatureCollection = JSON.parse(raw);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  await client.query('DELETE FROM districts WHERE city_id = $1', [cityId]);

  const skipped: string[] = [];
  for (const feature of geojson.features) {
    const name =
      feature.properties[cityConfig.nameProperty] ??
      feature.properties.name ??
      'Unknown';
    const geomJson = JSON.stringify(feature.geometry);

    // The source outlines are simplified, which can leave them crossing over
    // themselves; repair each on the way in (see migration 003). An outline
    // with no area left after repair is skipped rather than stored empty.
    const inserted = await client.query(
      `INSERT INTO districts (name, geom, city_id)
       SELECT $1, g, $3
       FROM (SELECT ST_Multi(ST_CollectionExtract(
               ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 'method=structure'), 3)) AS g) r
       WHERE NOT ST_IsEmpty(g)`,
      [name, geomJson, cityId],
    );
    if (inserted.rowCount === 0) skipped.push(name);
  }

  const seeded = geojson.features.length - skipped.length;
  console.log(`Seeded ${seeded} districts for ${cityConfig.name}`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} with no area after repair: ${skipped.join(', ')}`);
  }
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
