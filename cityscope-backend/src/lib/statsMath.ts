/** POIs per km². Guards against divide-by-zero. */
export function densityPerKm2(count: number, areaKm2: number): number {
  return areaKm2 > 0 ? count / areaKm2 : 0;
}

/**
 * Percentage difference of `value` vs `average`.
 * Returns null when the average is 0 (no meaningful comparison).
 */
export function pctVsAverage(value: number, average: number): number | null {
  if (!(average > 0)) return null;
  return ((value - average) / average) * 100;
}
