/** Walk lines: a block's route to its nearest place, thinned for storage. */

export const WALK_SIMPLIFY_METRES = 2;

const METRES_PER_DEGREE = 111_195;

function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Douglas-Peucker in a local equirectangular projection. Keeps both ends,
 * rounds to 5 decimals, drops consecutive duplicates, and always returns at least two points.
 */
export function simplifyWalk(
  coords: readonly [number, number][],
  toleranceMetres: number = WALK_SIMPLIFY_METRES,
): [number, number][] {
  const pts: [number, number][] = [];
  for (const [lng, lat] of coords) {
    const p: [number, number] = [round5(lng), round5(lat)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (pts.length === 0) return [];
  if (pts.length === 1) return [pts[0], pts[0]];
  if (pts.length === 2) return pts;

  const midLat = (pts[0][1] + pts[pts.length - 1][1]) / 2;
  const kx = METRES_PER_DEGREE * Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * kx);
  const ys = pts.map((p) => p[1] * METRES_PER_DEGREE);

  const distanceToSegment = (i: number, a: number, b: number): number => {
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((xs[i] - xs[a]) * dx + (ys[i] - ys[a]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(xs[i] - (xs[a] + t * dx), ys[i] - (ys[a] + t * dy));
  };

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    let worst = -1;
    let worstDist = toleranceMetres;
    for (let i = a + 1; i < b; i += 1) {
      const d = distanceToSegment(i, a, b);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}
