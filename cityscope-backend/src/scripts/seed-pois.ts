import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';
import { CITY_CONFIGS } from '../config/cities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Poi {
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

async function seed() {
  const cityId = process.argv[2];
  if (!cityId) {
    console.error('Usage: tsx seed-pois.ts <cityId>');
    console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const cityConfig = CITY_CONFIGS.find((c) => c.id === cityId);
  if (!cityConfig) {
    console.error(`Unknown city: ${cityId}`);
    process.exit(1);
  }

  const dataPath = path.resolve(__dirname, `pois-data-${cityId}.json`);

  let raw: string;
  try {
    raw = readFileSync(dataPath, 'utf-8');
  } catch {
    console.error(`POI data file not found: ${dataPath}`);
    console.error(`Run "npm run fetch:pois -- ${cityId}" first`);
    process.exit(1);
  }

  const pois: Poi[] = JSON.parse(raw);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  // One transaction per city: the live demo reads this table, so a failure
  // partway through must leave the previous data in place rather than a
  // half-deleted city.
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM pois WHERE city_id = $1', [cityId]);

    const batchSize = 500;
    for (let i = 0; i < pois.length; i += batchSize) {
      const batch = pois.slice(i, i + batchSize);
      const values: (string | number | null)[] = [];
      const placeholders: string[] = [];

      batch.forEach((poi, idx) => {
        const offset = idx * 5;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
        );
        values.push(poi.name, poi.category, poi.lat, poi.lng, cityId);
      });

      await client.query(
        `INSERT INTO pois (name, category, lat, lng, city_id) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }

  console.log(`Seeded ${pois.length} POIs for ${cityConfig.name}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
