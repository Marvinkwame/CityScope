import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db.js';
import { announceTarget } from '../lib/dbTarget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  announceTarget();

  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx src/scripts/migrate.ts <migration-file.sql>');
    process.exit(1);
  }
  const sql = readFileSync(path.resolve(__dirname, 'migrations', file), 'utf-8');
  console.log(`Applying migration ${file} ...`);
  await pool.query(sql);
  console.log('Migration applied.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
