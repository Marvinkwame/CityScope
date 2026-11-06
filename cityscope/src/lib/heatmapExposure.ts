/** Berlin's p99 of POIs per 400 m cell, the city the heatmap curve was tuned on. */
export const REFERENCE_P99 = 45;

/** Cell edge, in metres, for counting POI density. */
const CELL_METRES = 400;
const METRES_PER_DEGREE_LAT = 111320;

/** Bounds stop a tiny or freak dataset from blowing the heatmap out or blacking it. */
const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 1.5;

interface LngLat {
  lng: number;
  lat: number;
}

/**
 * The categories the POI heatmap draws: the original eleven. The everyday-needs
 * categories (pharmacy, doctors, clinic, school, station, halt) are served for
 * the place lists but stay off the heatmap, so its per-city tuning is unchanged.
 */
export const HEATMAP_CATEGORIES: ReadonlySet<string> = new Set([
  'restaurant', 'cafe', 'pub', 'bar', 'supermarket', 'bakery',
  'park', 'playground', 'attraction', 'museum', 'hotel',
]);

/** The points the heatmap shows, and the ones its weight is computed from. */
export function heatmapPoints<T extends { category: string }>(pois: readonly T[]): T[] {
  return pois.filter((poi) => HEATMAP_CATEGORIES.has(poi.category));
}

/**
 * The 99th-percentile count of POIs per 400 m cell, over occupied cells only.
 * Measures how hot the hottest parts of a city run, ignoring a few freak cells.
 */
export function densityP99(points: ReadonlyArray<LngLat>): number {
  if (points.length === 0) return 0;

  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const dLat = CELL_METRES / METRES_PER_DEGREE_LAT;
  const dLng = CELL_METRES / (METRES_PER_DEGREE_LAT * Math.cos((meanLat * Math.PI) / 180));

  const cells = new Map<string, number>();
  for (const p of points) {
    const key = `${Math.floor(p.lng / dLng)},${Math.floor(p.lat / dLat)}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }

  const counts = [...cells.values()].sort((a, b) => a - b);
  return counts[Math.min(counts.length - 1, Math.floor(0.99 * counts.length))];
}

/**
 * Per-city `heatmap-weight`. One heatmap curve can't suit every city: Tokyo and
 * Paris run about twice as dense as Berlin and white out. Scaling the weight by
 * REFERENCE_P99 / p99 puts each city's hot cells at the same exposure.
 */
export function heatmapWeight(points: ReadonlyArray<LngLat>): number {
  const p99 = densityP99(points);
  if (p99 === 0) return 1;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, REFERENCE_P99 / p99));
}
