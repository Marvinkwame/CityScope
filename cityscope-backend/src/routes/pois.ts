import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';
import { densityPerKm2 } from '../lib/statsMath.js';
import { isPolygonGeometry } from '../lib/geometry.js';

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

poiRouter.post('/within', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';
    const polygon = (req.body as { polygon?: unknown }).polygon;

    if (!isPolygonGeometry(polygon)) {
      res.status(400).json({ error: 'Body must be { polygon: <GeoJSON Polygon> }' });
      return;
    }

    const result = await pool.query(
      `WITH poly AS (
         SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g
       ),
       inside AS (
         SELECT p.category
         FROM pois p, poly
         WHERE p.city_id = $2 AND ST_Within(p.geom, poly.g)
       )
       SELECT
         (SELECT count(*) FROM inside)                  AS poi_count,
         (SELECT ST_Area(g::geography) / 1e6 FROM poly) AS area_km2,
         COALESCE((
           SELECT json_agg(tc) FROM (
             SELECT category, count(*)::int AS count
             FROM inside GROUP BY category ORDER BY count(*) DESC LIMIT 5
           ) tc
         ), '[]'::json)                                 AS top_categories`,
      [JSON.stringify(polygon), cityId],
    );

    const row = result.rows[0];
    const poiCount = Number(row.poi_count);
    const areaKm2 = Number(row.area_km2);
    const density = densityPerKm2(poiCount, areaKm2);

    res.json({
      poiCount,
      areaKm2: Number(areaKm2.toFixed(3)),
      densityPerKm2: Number(density.toFixed(1)),
      topCategories: row.top_categories,
    });
  } catch (err) {
    console.error('Failed to analyse area:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
