/**
 * Seeded sampling, so a calibration run picks the same cells every time.
 */

/** A small, fast, seedable generator. Yields numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Weighted sampling without replacement (Efraimidis–Spirakis). Each item with
 * a positive weight draws one uniform r and gets the key r ** (1 / weight); the
 * n largest keys win, returned in descending key order. An item whose weight
 * is zero or below is never chosen, and asking for more than exist returns
 * every item that could be.
 */
export function weightedSample(
  items: readonly { id: string; weight: number }[],
  n: number,
  seed: number,
): string[] {
  if (!(n > 0)) return [];

  const next = mulberry32(seed);
  const keyed: { id: string; key: number }[] = [];
  for (const { id, weight } of items) {
    if (!(weight > 0)) continue;
    keyed.push({ id, key: next() ** (1 / weight) });
  }

  // Array.prototype.sort is stable, so a (vanishingly rare) tie keeps input order.
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, n).map((entry) => entry.id);
}
