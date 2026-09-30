export interface ContourPayloadEntry {
  contour: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/**
 * Maps a Mapbox Isochrone FeatureCollection into our own request contract.
 *
 * Keeping this translation on the client means the API contract does not track
 * Mapbox's response format — if their payload shape changes, only this function
 * moves.
 */
export function toContourPayload(
  fc: GeoJSON.FeatureCollection | undefined,
): ContourPayloadEntry[] {
  if (!fc?.features) return [];

  return fc.features
    .filter(
      (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
        f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
    )
    .map((f) => ({
      contour: Number(f.properties?.contour ?? 0),
      geometry: f.geometry,
    }))
    .sort((a, b) => a.contour - b.contour);
}
