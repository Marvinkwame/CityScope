import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';
import { densityPerKm2, pctVsAverage } from '../lib/statsMath.js';
import { MEASUREMENT_ONLY_CATEGORIES } from '../lib/needs.js';

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

districtRouter.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';
    const { id } = req.params;

    const result = await pool.query(
      `WITH target AS (
         SELECT id, name, geom, ST_Area(geom::geography) / 1e6 AS area_km2
         FROM districts
         WHERE id = $1 AND city_id = $2
       ),
       inside AS (
         SELECT p.category
         FROM pois p, target t
         WHERE p.city_id = $2 AND ST_Contains(t.geom, p.geom)
           AND p.category <> ALL($3::text[])
       ),
       per_district AS (
         SELECT count(p.id)::float / NULLIF(ST_Area(d.geom::geography) / 1e6, 0) AS density
         FROM districts d
         LEFT JOIN pois p ON p.city_id = d.city_id AND ST_Contains(d.geom, p.geom)
           AND p.category <> ALL($3::text[])
         WHERE d.city_id = $2
         GROUP BY d.id, d.geom
       )
       SELECT
         t.id        AS district_id,
         t.name      AS name,
         t.area_km2  AS area_km2,
         (SELECT count(*) FROM inside)                 AS poi_count,
         (SELECT AVG(density) FROM per_district)       AS city_avg_density,
         COALESCE((
           SELECT json_agg(tc) FROM (
             SELECT category, count(*)::int AS count
             -- Every displayed category, largest first. The client shows
             -- the top 5 and counts the rest as "+ N more categories".
             FROM inside GROUP BY category ORDER BY count(*) DESC
           ) tc
         ), '[]'::json)                                AS top_categories
       FROM target t`,
      [id, cityId, [...MEASUREMENT_ONLY_CATEGORIES]],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'District not found' });
      return;
    }

    const row = result.rows[0];
    const poiCount = Number(row.poi_count);
    const areaKm2 = Number(row.area_km2);
    const cityAvgDensity = row.city_avg_density === null ? 0 : Number(row.city_avg_density);
    const density = densityPerKm2(poiCount, areaKm2);
    const pct = pctVsAverage(density, cityAvgDensity);

    res.json({
      districtId: row.district_id,
      name: row.name,
      poiCount,
      areaKm2: Number(areaKm2.toFixed(3)),
      densityPerKm2: Number(density.toFixed(1)),
      topCategories: row.top_categories,
      cityAvgDensity: Number(cityAvgDensity.toFixed(1)),
      densityVsCityPct: pct === null ? null : Number(pct.toFixed(1)),
    });
  } catch (err) {
    console.error('Failed to fetch district stats:', err);
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
