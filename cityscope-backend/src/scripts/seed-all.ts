import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { CITY_CONFIGS } from '../config/cities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(script: string, args: string[] = []) {
  const cmd = `npx tsx ${path.resolve(__dirname, script)} ${args.join(' ')}`;
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

async function seedAll() {
  console.log('=== Seeding cities table ===');
  run('seed-cities.ts');

  for (const city of CITY_CONFIGS) {
    console.log(`\n=== Processing ${city.name} ===`);

    // Seed districts if GeoJSON exists
    const geojsonPath = path.resolve(
      __dirname,
      `../../../cityscope/public/data/${city.id}-districts.geojson`,
    );
    if (existsSync(geojsonPath)) {
      run('seed.ts', [city.id]);
    } else {
      console.log(`  Skipping districts — no GeoJSON file found at ${geojsonPath}`);
    }

    // Seed POIs if data file exists
    const poisPath = path.resolve(__dirname, `pois-data-${city.id}.json`);
    if (existsSync(poisPath)) {
      run('seed-pois.ts', [city.id]);
    } else {
      console.log(`  Skipping POIs — no data file found. Run: npm run fetch:pois -- ${city.id}`);
    }
  }

  console.log('\n=== Seed complete ===');
}

seedAll().catch((err) => {
  console.error('Seed all failed:', err);
  process.exit(1);
});
