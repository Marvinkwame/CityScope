import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';

export const poiRouter = Router({ mergeParams: true });

poiRouter.get('/', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';

    const result = await pool.query(
      'SELECT id, name, category, lat, lng FROM pois WHERE city_id = $1',
      [cityId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch POIs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
