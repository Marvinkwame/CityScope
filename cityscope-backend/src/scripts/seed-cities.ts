import pg from 'pg';
import 'dotenv/config';
import { CITY_CONFIGS } from '../config/cities.js';
import { announceTarget } from '../lib/dbTarget.js';

async function seedCities() {
  announceTarget();

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  for (const city of CITY_CONFIGS) {
    await client.query(
      `INSERT INTO cities (id, name, country, center_lng, center_lat, default_zoom, bounds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         country = EXCLUDED.country,
         center_lng = EXCLUDED.center_lng,
         center_lat = EXCLUDED.center_lat,
         default_zoom = EXCLUDED.default_zoom,
         bounds = EXCLUDED.bounds`,
      [
        city.id,
        city.name,
        city.country,
        city.centerLng,
        city.centerLat,
        city.defaultZoom,
        JSON.stringify(city.bounds),
      ],
    );
  }

  console.log(`Seeded ${CITY_CONFIGS.length} cities`);
  await client.end();
}

seedCities().catch((err) => {
  console.error('Seed cities failed:', err);
  process.exit(1);
});
