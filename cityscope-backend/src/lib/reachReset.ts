/**
 * Clearing a city's reach data when its places or parks are reloaded.
 *
 * reach_nearest stores place ids, and a reload gives every place a new id, so
 * after a reload the city's cells, nearest places, calibration and payload
 * describe places that no longer exist: a block card would name the wrong
 * place, or none. The seed scripts therefore delete them in the same
 * transaction as the reload, and the city answers 404 until reach:build,
 * reach:calibrate and reach:publish have run again.
 */

/** The part of a pg client this needs: pg.Client and PoolClient both fit. */
export interface SqlRunner {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Deletes the city's reach payload, calibration and cells (the cells cascade
 * to reach_nearest), when the reach tables exist; before migration 004 there
 * is nothing to clear. Returns whether it cleared anything.
 */
export async function clearStaleReach(db: SqlRunner, cityId: string): Promise<boolean> {
  const { rows } = await db.query("SELECT to_regclass('public.reach_cells') IS NOT NULL AS present");
  const present = (rows[0] as { present?: unknown } | undefined)?.present === true;
  if (!present) return false;

  await db.query('DELETE FROM reach_payloads WHERE city_id = $1', [cityId]);
  await db.query('DELETE FROM reach_calibration WHERE city_id = $1', [cityId]);
  await db.query('DELETE FROM reach_cells WHERE city_id = $1', [cityId]);
  return true;
}

/** What a seed script prints after clearing a city's reach data. */
export function staleReachNotice(cityId: string): string {
  return (
    `Cleared ${cityId}'s reach data (cells, nearest places, calibration and payload): place ids changed. ` +
    `Run reach:build, reach:calibrate and reach:publish for ${cityId} again` +
    (cityId === 'london' ? ', with reach:check-gp before the publish.' : '.')
  );
}
