// Prints one README table row comparing a city's reach before and after the
// street-network rebuild.
//
// "Before" is the city's earlier production payload, saved as JSON in
// data/reach-before/<cityId>.json. "After" is the payload in reach_payloads
// (Brotli-compressed), read inside a read-only transaction. Nothing is written.
//
// Usage: tsx src/scripts/compare-reach.ts <cityId>
// Check the printed database host: .env points at production.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { CITY_CONFIGS } from '../config/cities.js';
import pool from '../db.js';
import { describeDatabase } from '../lib/dbTarget.js';
import { compareReach } from '../lib/reachCompare.js';
import type { ReachPayload } from '../lib/reachPayload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BEFORE_DIR = path.resolve(__dirname, '../../data/reach-before');

function usage(): never {
  console.error('Usage: tsx src/scripts/compare-reach.ts <cityId>');
  console.error('Available cities:', CITY_CONFIGS.map((c) => c.id).join(', '));
  process.exit(1);
}

function isPayload(value: unknown): value is ReachPayload {
  if (typeof value !== 'object' || value === null) return false;
  const { meta, features } = value as { meta?: unknown; features?: unknown };
  return typeof meta === 'object' && meta !== null && Array.isArray(features);
}

function parsePayload(text: string, what: string): ReachPayload {
  const parsed: unknown = JSON.parse(text);
  if (!isPayload(parsed)) throw new Error(`${what} is not a reach payload`);
  return parsed;
}

async function readAfter(cityId: string): Promise<ReachPayload> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    try {
      const { rows } = await client.query<{ body: Buffer }>('SELECT body FROM reach_payloads WHERE city_id = $1', [
        cityId,
      ]);
      const row = rows[0];
      if (!row) throw new Error(`No published payload for ${cityId} in the database`);
      return parsePayload(brotliDecompressSync(row.body).toString('utf8'), 'The stored payload');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

const pct = (share: number): string => `${(share * 100).toFixed(1)}%`;
const pctRange = (h: { k: number; low: number; high: number }): string =>
  `${pct(h.k)} (${pct(h.low)} to ${pct(h.high)})`;
const baseRate = (rate: number | undefined): string => (rate === undefined ? 'n/a' : pct(rate));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) usage();
  const city = CITY_CONFIGS.find((c) => c.id === args[0]);
  if (!city) {
    console.error(`Unknown city: ${args[0]}`);
    usage();
  }

  console.error(`Reading from ${describeDatabase(process.env.DATABASE_URL)}`);
  try {
    const beforePath = path.join(BEFORE_DIR, `${city.id}.json`);
    const before = parsePayload(readFileSync(beforePath, 'utf8'), beforePath);
    const after = await readAfter(city.id);
    const c = compareReach(before, after);

    console.log(
      '| City | Residents within 15 min, before | after | 15-min agreement, before | after | 15-min base rate, before | after | Residents whose block changes colour at 5 / 10 / 15 min | Blocks matched (only before / only after) |',
    );
    console.log('|---|---|---|---|---|---|---|---|---|');
    console.log(
      `| ${city.name} | ${pctRange(c.headline.before)} | ${pctRange(c.headline.after)} | ` +
        `${pct(c.agreement.before[15])} | ${pct(c.agreement.after[15])} | ` +
        `${baseRate(c.baseRates.before[15])} | ${baseRate(c.baseRates.after[15])} | ` +
        `${pct(c.colourChanged[5])} / ${pct(c.colourChanged[10])} / ${pct(c.colourChanged[15])} | ` +
        `${c.blocks.matched} (${c.blocks.onlyBefore} / ${c.blocks.onlyAfter}) |`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Compare failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
