import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';

export const poiRouter = Router();

poiRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, category, lat, lng FROM pois',
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch POIs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
