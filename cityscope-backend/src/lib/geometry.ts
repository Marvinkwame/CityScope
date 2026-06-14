export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Minimal structural check that an unknown value is a closed GeoJSON Polygon. */
export function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt: unknown) =>
      Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number',
  );
}
