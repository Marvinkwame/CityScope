/**
 * Helpers for inspecting mapbox-gl-draw's feature store.
 *
 * Deliberately kept separate from the polygon validation in `shareCodec.ts`:
 * that one guards untrusted input arriving from a URL, this one interprets a
 * library's internal state. They happen to look alike, but they answer
 * different questions and would drift apart for different reasons.
 */

function isCompletePolygonGeometry(geometry: GeoJSON.Geometry | null | undefined): boolean {
  if (!geometry || geometry.type !== 'Polygon') return false;
  const ring: unknown = geometry.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt: unknown) =>
      Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number',
  );
}

/**
 * True only when the draw store holds a polygon the user actually finished.
 *
 * Counting `getAll().features.length` is not good enough. Calling
 * `changeMode('draw_polygon')` immediately inserts an in-progress stub —
 * observed live as `{ type: 'Polygon', coordinates: [[null]] }` — so a bare
 * length check reports a drawn shape the instant the tool is armed, even
 * though nothing has been drawn.
 */
export function hasCompletePolygon(features: GeoJSON.Feature[]): boolean {
  return features.some((f) => isCompletePolygonGeometry(f?.geometry));
}
