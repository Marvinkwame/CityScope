import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';

export const districtRouter = Router({ mergeParams: true });

districtRouter.get('/', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';

    const result = await pool.query(
      `SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'id', id,
            'properties', json_build_object('name', name),
            'geometry', ST_AsGeoJSON(geom)::json
          )
        ), '[]'::json)
      ) AS geojson
      FROM districts
      WHERE city_id = $1`,
      [cityId],
    );

    res.json(result.rows[0].geojson);
  } catch (err) {
    console.error('Failed to fetch districts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

districtRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, ST_AsGeoJSON(geom)::json AS geometry FROM districts WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'District not found' });
      return;
    }

    const row = result.rows[0];
    res.json({
      type: 'Feature',
      id: row.id,
      properties: { name: row.name },
      geometry: row.geometry,
    });
  } catch (err) {
    console.error('Failed to fetch district:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
