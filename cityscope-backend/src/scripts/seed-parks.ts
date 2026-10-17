import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';
import { CITY_CONFIGS } from '../config/cities.js';
import { announceTarget } from '../lib/dbTarget.js';
import { isAreaGeometry } from '../lib/geometry.js';
import type { AreaGeometry } from '../lib/geometry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

interface Park {
  osmId: string;
  name: string | null;
  geometry: AreaGeometry;
}

/** Reads what fetch-parks wrote: a FeatureCollection of park polygons. */
function readParks(raw: string): Park[] {
  const parsed: unknown = JSON.parse(raw);
  const features = (parsed as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    throw new Error('Park file is not a FeatureCollection');
  }

  return features.map((feature: unknown, i: number): Park => {
    const f = feature as { properties?: { osmId?: unknown; name?: unknown }; geometry?: unknown };
    const osmId = f.properties?.osmId;
    const name = f.properties?.name;
    if (typeof osmId !== 'string' || !isAreaGeometry(f.geometry)) {
      throw new Error(`Park file feature ${i} has no osmId or no polygon geometry`);
    }
    return { osmId, name: typeof name === 'string' ? name : null, geometry: f.geometry };
  });
}

// One batch is one statement. The shape is made valid first (a self-touching
// outline from OSM is repaired, not rejected), reduced to its polygons and
// stored as a MultiPolygon; the area is measured on the spheroid, in square
// metres. Anything that ends up empty is skipped rather than stored.
const INSERT_PARKS = `
  INSERT INTO parks (city_id, osm_id, name, geom, area_m2)
  SELECT $1::varchar, v.osm_id, v.name, v.geom, ST_Area(v.geom::geography)
  FROM (
    SELECT
      x.osm_id,
      x.name,
      ST_Multi(
        ST_CollectionExtract(
          ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x.g), 4326), 'method=structure'),
          3
        )
      ) AS geom
    FROM unnest($2::text[], $3::text[], $4::text[]) AS x(osm_id, name, g)
  ) v
  WHERE NOT ST_IsEmpty(v.geom)
`;

async function seed() {
  announceTarget();

  const cityId = process.argv[2];
  if (!cityId) {
    console.error('Usage: tsx seed-parks.ts <cityId>');
    console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const cityConfig = CITY_CONFIGS.find((c) => c.id === cityId);
  if (!cityConfig) {
    console.error(`Unknown city: ${cityId}`);
    process.exit(1);
  }

  const dataPath = path.join(DATA_DIR, `parks-${cityId}.json`);

  let raw: string;
  try {
    raw = readFileSync(dataPath, 'utf-8');
  } catch {
    console.error(`Park data file not found: ${dataPath}`);
    console.error(`Run "npm run fetch:parks -- ${cityId}" first`);
    process.exit(1);
  }

  const parks = readParks(raw);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  // The parks table has no unique key on (city_id, osm_id), so a rerun replaces
  // the city's rows instead of adding to them. One transaction: a failure
  // partway through leaves the previous parks in place, never a half-empty city.
  let inserted = 0;
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM parks WHERE city_id = $1', [cityId]);

    const batchSize = 200;
    for (let i = 0; i < parks.length; i += batchSize) {
      const batch = parks.slice(i, i + batchSize);
      const result = await client.query(INSERT_PARKS, [
        cityId,
        batch.map((p) => p.osmId),
        batch.map((p) => p.name),
        batch.map((p) => JSON.stringify(p.geometry)),
      ]);
      inserted += result.rowCount ?? 0;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }

  console.log(
    `Seeded ${inserted} parks for ${cityConfig.name} (${parks.length - inserted} skipped as empty)`,
  );
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
