import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, 'pois-data.json');

interface Poi {
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

async function seed() {
  const raw = readFileSync(dataPath, 'utf-8');
  const pois: Poi[] = JSON.parse(raw);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  await client.query('TRUNCATE pois RESTART IDENTITY');

  // Batch insert in groups of 500
  const batchSize = 500;
  for (let i = 0; i < pois.length; i += batchSize) {
    const batch = pois.slice(i, i + batchSize);
    const values: (string | number | null)[] = [];
    const placeholders: string[] = [];

    batch.forEach((poi, idx) => {
      const offset = idx * 4;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
      );
      values.push(poi.name, poi.category, poi.lat, poi.lng);
    });

    await client.query(
      `INSERT INTO pois (name, category, lat, lng) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  console.log(`Seeded ${pois.length} POIs`);
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
