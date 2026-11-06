import { describe, expect, it } from 'vitest';
import { clearStaleReach, staleReachNotice } from './reachReset';
import type { SqlRunner } from './reachReset';

/** A stand-in database that records each statement and answers the table check. */
function fakeDb(tablesExist: boolean): SqlRunner & { calls: { text: string; values?: unknown[] }[] } {
  const calls: { text: string; values?: unknown[] }[] = [];
  return {
    calls,
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      if (text.includes('to_regclass')) return { rows: [{ present: tablesExist }] };
      return { rows: [], rowCount: 1 };
    },
  };
}

describe('clearStaleReach', () => {
  it("deletes the city's payload, calibration and cells when the reach tables exist", async () => {
    const db = fakeDb(true);
    expect(await clearStaleReach(db, 'berlin')).toBe(true);
    expect(db.calls.map((c) => c.text)).toEqual([
      "SELECT to_regclass('public.reach_cells') IS NOT NULL AS present",
      'DELETE FROM reach_payloads WHERE city_id = $1',
      'DELETE FROM reach_calibration WHERE city_id = $1',
      'DELETE FROM reach_cells WHERE city_id = $1',
    ]);
    for (const call of db.calls.slice(1)) expect(call.values).toEqual(['berlin']);
  });

  it('does nothing before migration 004, when there are no reach tables', async () => {
    const db = fakeDb(false);
    expect(await clearStaleReach(db, 'berlin')).toBe(false);
    expect(db.calls).toHaveLength(1);
  });

  it('only ever touches the one city', async () => {
    const db = fakeDb(true);
    await clearStaleReach(db, 'new-york');
    for (const call of db.calls.slice(1)) {
      expect(call.text).toMatch(/WHERE city_id = \$1$/);
      expect(call.values).toEqual(['new-york']);
    }
  });
});

describe('staleReachNotice', () => {
  it('names the three steps to rerun, and the GP check for London only', () => {
    expect(staleReachNotice('berlin')).toContain('reach:build, reach:calibrate and reach:publish for berlin');
    expect(staleReachNotice('berlin')).not.toContain('check-gp');
    expect(staleReachNotice('london')).toContain('reach:check-gp');
  });
});
