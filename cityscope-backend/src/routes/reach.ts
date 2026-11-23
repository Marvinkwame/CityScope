import { Router } from 'express';
import type { Request, Response } from 'express';
import { promisify } from 'node:util';
import { brotliDecompress } from 'node:zlib';
import pool from '../db.js';
import { NEED_IDS } from '../lib/needs.js';
import type { NeedId } from '../lib/needs.js';
import { REACH_CACHE_CONTROL, acceptsBrotli, isFresh, isH3CellId, isMissingColumn, isMissingTable } from '../lib/reachHttp.js';
import { parseWalk, shapeCellCard } from '../lib/reachPayload.js';
import type { CardRow } from '../lib/reachPayload.js';

export const reachRouter = Router({ mergeParams: true });

const decompress = promisify(brotliDecompress);

function isNeedId(value: unknown): value is NeedId {
  return NEED_IDS.some((id) => id === value);
}

const NO_REACH_DATA = { error: 'No reach data for this city' };

/**
 * The whole city's reach, as the one payload "npm run reach:publish" stored.
 * The bytes are served as they are, and nothing is computed per request.
 */
reachRouter.get('/', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId;

    const current = await pool.query<{ etag: string }>(
      'SELECT etag FROM reach_payloads WHERE city_id = $1',
      [cityId],
    );
    if (current.rows.length === 0) {
      res.status(404).json(NO_REACH_DATA);
      return;
    }

    // Answered before the body is read: a client that already holds the
    // current payload costs one small query.
    if (isFresh(req.get('If-None-Match'), current.rows[0].etag)) {
      res
        .status(304)
        .vary('Accept-Encoding')
        .set({
          ETag: current.rows[0].etag,
          'Cache-Control': REACH_CACHE_CONTROL,
        })
        .end();
      return;
    }

    // The etag is read again with the body, so the two sent together always
    // belong to each other even if the city was republished in between.
    const stored = await pool.query<{ body: Buffer; etag: string }>(
      'SELECT body, etag FROM reach_payloads WHERE city_id = $1',
      [cityId],
    );
    if (stored.rows.length === 0) {
      res.status(404).json(NO_REACH_DATA);
      return;
    }
    const { body, etag } = stored.rows[0];

    // The bytes to send are ready before any header is set, so a failed
    // decompression ends in a plain 500, never one carrying the payload's
    // ETag and a day-long Cache-Control that a cache could keep.
    const brotli = acceptsBrotli(req.get('Accept-Encoding'));
    const bytes = brotli ? body : await decompress(body);

    // vary() adds to any Vary header already set, rather than replacing it.
    res.status(200).vary('Accept-Encoding').set({
      ETag: etag,
      'Cache-Control': REACH_CACHE_CONTROL,
      'Content-Type': 'application/json',
      'Content-Length': String(bytes.length),
    });
    if (brotli) res.set('Content-Encoding', 'br');
    res.end(bytes);
  } catch (err) {
    // Before migration 004 the table does not exist: that is no data, not a fault.
    if (isMissingTable(err)) {
      res.status(404).json(NO_REACH_DATA);
      return;
    }
    console.error('Failed to fetch reach payload:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface CardDbRow {
  residents: number;
  k: number | null;
  need: string | null;
  metres: number | null;
  name: string | null;
  category: string | null;
  lng: number | null;
  lat: number | null;
  walk: string | null;
}

// One statement for the cell, its nearest places and the city's k. The cell is
// the driving row, so a cell with no nearest places still comes back (as one
// row with a null need) and an unknown cell comes back as no row at all.
// A park has no single point, so it is placed where its walk ends (the entry
// the walker reaches) or, with no stored walk, at the point of the park
// closest to the cell's centre.
function cardSql(withWalk: boolean): string {
  const parkPoint = (fn: 'ST_X' | 'ST_Y', endFn: 'ST_X' | 'ST_Y'): string =>
    withWalk
      ? `CASE WHEN n.walk IS NOT NULL THEN ${endFn}(ST_EndPoint(n.walk)) ELSE ${fn}(ST_ClosestPoint(pk.geom, c.centre)) END`
      : `${fn}(ST_ClosestPoint(pk.geom, c.centre))`;
  return `
  SELECT c.residents,
         cal.metres_per_minute AS k,
         n.need,
         n.metres,
         CASE n.place_kind WHEN 'poi' THEN p.name ELSE pk.name END AS name,
         CASE n.place_kind WHEN 'poi' THEN p.category ELSE 'park' END AS category,
         CASE n.place_kind WHEN 'poi' THEN p.lng ELSE ${parkPoint('ST_X', 'ST_X')} END AS lng,
         CASE n.place_kind WHEN 'poi' THEN p.lat ELSE ${parkPoint('ST_Y', 'ST_Y')} END AS lat,
         ${withWalk ? 'ST_AsGeoJSON(n.walk, 5)' : 'NULL::text'} AS walk
  FROM reach_cells c
  LEFT JOIN reach_calibration cal ON cal.city_id = c.city_id
  LEFT JOIN reach_nearest n ON n.city_id = c.city_id AND n.h3 = c.h3
  LEFT JOIN pois p ON n.place_kind = 'poi' AND p.id = n.place_id AND p.city_id = n.city_id
  LEFT JOIN parks pk ON n.place_kind = 'park' AND pk.id = n.place_id AND pk.city_id = n.city_id
  WHERE c.city_id = $1 AND c.h3 = $2
`;
}

const CARD_SQL = cardSql(true);
// Before migration 005 reach_nearest has no walk column: the same card, with no walks.
const CARD_SQL_WITHOUT_WALK = cardSql(false);

/** The nearest place for each need around one block, for the card the map opens. */
reachRouter.get('/:cellId', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId;
    const cellId = req.params.cellId;

    if (typeof cellId !== 'string' || !isH3CellId(cellId)) {
      res.status(400).json({ error: 'Invalid cell id' });
      return;
    }

    let result;
    try {
      result = await pool.query<CardDbRow>(CARD_SQL, [cityId, cellId]);
    } catch (err) {
      // No walk column yet (migration 005 not applied): answer without walks, as an estimate build would.
      if (!isMissingColumn(err)) throw err;
      result = await pool.query<CardDbRow>(CARD_SQL_WITHOUT_WALK, [cityId, cellId]);
    }
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No such cell in this city' });
      return;
    }

    const { residents, k } = result.rows[0];
    if (k === null) {
      // Cells without a calibration are a city that was built but never
      // published, so there is nothing to turn metres into minutes with.
      res.status(404).json(NO_REACH_DATA);
      return;
    }

    const rows: CardRow[] = [];
    for (const row of result.rows) {
      // A place that has since been reloaded under a new id joins to nothing;
      // it is left out, and the card shows that need as not found.
      if (
        isNeedId(row.need) &&
        row.metres !== null &&
        row.category !== null &&
        row.lng !== null &&
        row.lat !== null
      ) {
        rows.push({
          need: row.need,
          metres: row.metres,
          name: row.name,
          category: row.category,
          lng: row.lng,
          lat: row.lat,
          walk: parseWalk(row.walk),
        });
      }
    }

    res.set('Cache-Control', REACH_CACHE_CONTROL).json(shapeCellCard(cellId, residents, rows, k));
  } catch (err) {
    // Before migration 004 the tables do not exist: that is no data, not a fault.
    if (isMissingTable(err)) {
      res.status(404).json(NO_REACH_DATA);
      return;
    }
    console.error('Failed to fetch reach card:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
