import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db.js';
import { densityPerKm2 } from '../lib/statsMath.js';
import { isPolygonGeometry, isContourInputArray } from '../lib/geometry.js';
import { groupPoisByBand, type BandRow } from '../lib/isochroneBands.js';

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
             -- Every category (there are 11), largest first. The client shows
             -- the top 5 and counts the rest as "+ N more categories".
             FROM inside GROUP BY category ORDER BY count(*) DESC
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

poiRouter.post('/in-isochrone', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';
    const contours = (req.body as { contours?: unknown }).contours;

    if (!isContourInputArray(contours)) {
      res.status(400).json({
        error:
          'Body must be { contours: [{ contour: <integer>, geometry: <GeoJSON Polygon|MultiPolygon> }] }, 1-6 entries',
      });
      return;
    }

    const result = await pool.query(
      `WITH bands AS (
         SELECT (c->>'contour')::int AS contour,
                ST_SetSRID(ST_GeomFromGeoJSON(c->'geometry'), 4326) AS g
         FROM jsonb_array_elements($1::jsonb) AS c
       )
       SELECT b.contour, p.id, p.name, p.category, p.lat, p.lng
       FROM bands b
       JOIN pois p ON p.city_id = $2 AND ST_Within(p.geom, b.g)
       ORDER BY b.contour, p.category, p.name`,
      [JSON.stringify(contours), cityId],
    );

    const rows: BandRow[] = result.rows.map((r) => ({
      contour: Number(r.contour),
      id: Number(r.id),
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));

    res.json({ bands: groupPoisByBand(rows, contours.map((c) => c.contour)) });
  } catch (err) {
    // The 400 contract is enforced entirely by isContourInputArray above.
    // ST_GeomFromGeoJSON turns out to be very lenient with anything that gets
    // past that guard — verified against Neon: an unclosed ring, a
    // non-numeric third ordinate, a zero-area ring and out-of-range
    // coordinates all parse fine and return 200. So there is no
    // geometry-specific error to translate here, and sniffing the message for
    // "geometry" would only risk reporting a genuine server fault as a 400.
    console.error('Failed to analyse isochrone bands:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
