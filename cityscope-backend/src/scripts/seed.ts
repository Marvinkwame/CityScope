import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const geojsonPath = path.resolve(
  __dirname,
  '../../../cityscope/public/data/berlin-districts.geojson',
);

interface Feature {
  type: string;
  properties: { name: string };
  geometry: object;
}

interface FeatureCollection {
  type: string;
  features: Feature[];
}

async function seed() {
  const raw = readFileSync(geojsonPath, 'utf-8');
  const geojson: FeatureCollection = JSON.parse(raw);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  await client.query('TRUNCATE districts RESTART IDENTITY');

  for (const feature of geojson.features) {
    const name = feature.properties.name;
    const geomJson = JSON.stringify(feature.geometry);

    await client.query(
      `INSERT INTO districts (name, geom)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))`,
      [name, geomJson],
    );
  }

  console.log(`Seeded ${geojson.features.length} districts`);
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
