import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';

export const cityRouter = Router();

cityRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, country,
              center_lng AS "centerLng",
              center_lat AS "centerLat",
              default_zoom AS "defaultZoom",
              bounds
       FROM cities
       ORDER BY name`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch cities:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

cityRouter.get('/:cityId', async (req: Request, res: Response) => {
  try {
    const { cityId } = req.params;
    const result = await pool.query(
      `SELECT id, name, country,
              center_lng AS "centerLng",
              center_lat AS "centerLat",
              default_zoom AS "defaultZoom",
              bounds
       FROM cities WHERE id = $1`,
      [cityId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to fetch city:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
