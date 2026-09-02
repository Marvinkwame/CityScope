export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** One isochrone contour: the travel time in minutes plus its reachable area. */
export interface ContourInput {
  contour: number;
  geometry: AreaGeometry;
}

/** Upper bound on contours per request — Mapbox itself caps at 4, this leaves headroom. */
export const MAX_CONTOURS = 6;

/** A linear ring: at least 4 positions, each a [lng, lat] number pair. */
function isRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false;
  return value.every(
    (pt: unknown) =>
      Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number',
  );
}

/** Minimal structural check that an unknown value is a closed GeoJSON Polygon. */
export function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  return isRing(g.coordinates[0]);
}

/**
 * Accepts Polygon or MultiPolygon. Mapbox does not currently return
 * MultiPolygon with polygons=true, but ST_Within is indifferent to the
 * distinction and the old client-side join already handled both.
 */
export function isAreaGeometry(value: unknown): value is AreaGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  if (g.type === 'Polygon') return isRing(g.coordinates[0]);
  if (g.type === 'MultiPolygon') {
    return g.coordinates.every(
      (poly: unknown) => Array.isArray(poly) && poly.length > 0 && isRing(poly[0]),
    );
  }
  return false;
}

/** Validates the `contours` array of an /in-isochrone request body. */
export function isContourInputArray(value: unknown): value is ContourInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CONTOURS) return false;
  return value.every((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const c = entry as { contour?: unknown; geometry?: unknown };
    return Number.isInteger(c.contour) && isAreaGeometry(c.geometry);
  });
}
