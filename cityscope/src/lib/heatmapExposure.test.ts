import { describe, it, expect } from 'vitest';
import { REFERENCE_P99, densityP99, heatmapWeight } from './heatmapExposure';

// The same 400 m cell size the implementation uses, at a fixed latitude. The
// grid hugs lng 0 so a tiny drift in the implementation's mean latitude can't
// push a point across a cell edge.
const LAT = 52.5;
const D_LAT = 400 / 111320;
const D_LNG = 400 / (111320 * Math.cos((LAT * Math.PI) / 180));
const ROW_0 = Math.round(LAT / D_LAT);
const COLUMNS = 20;

/** `counts[i]` points at the centre of cell i, laid out row by row. */
function gridPoints(counts: number[]): Array<{ lng: number; lat: number }> {
  return counts.flatMap((n, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const centre = { lng: (col + 0.5) * D_LNG, lat: (ROW_0 + row + 0.5) * D_LAT };
    return Array.from({ length: n }, () => ({ ...centre }));
  });
}

/** 100 cells that each hold `n` points. */
const uniformCity = (n: number) => gridPoints(Array.from({ length: 100 }, () => n));

describe('densityP99', () => {
  it('is 0 for no points', () => {
    expect(densityP99([])).toBe(0);
  });

  it('equals the count when every cell holds the same number of points', () => {
    expect(densityP99(uniformCity(1))).toBe(1);
    expect(densityP99(uniformCity(30))).toBe(30);
  });

  it('ignores a few freak cells', () => {
    const counts = Array.from({ length: 200 }, () => 10);
    counts[0] = 1000;
    expect(densityP99(gridPoints(counts))).toBe(10);
  });
});

describe('heatmapWeight', () => {
  it('is 1 for no points', () => {
    expect(heatmapWeight([])).toBe(1);
  });

  it('is 1 for a city whose p99 is the reference', () => {
    expect(heatmapWeight(uniformCity(REFERENCE_P99))).toBe(1);
  });

  it('halves when every cell holds twice as many points', () => {
    const sparse = heatmapWeight(uniformCity(40));
    const dense = heatmapWeight(uniformCity(80));
    expect(dense).toBeCloseTo(sparse / 2, 10);
  });

  it('is capped for a city far sparser than the reference', () => {
    expect(heatmapWeight(uniformCity(5))).toBe(1.5);
  });

  it('is floored for a city far denser than the reference', () => {
    expect(heatmapWeight(uniformCity(500))).toBe(0.25);
  });
});
