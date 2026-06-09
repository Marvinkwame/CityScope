import { describe, it, expect } from 'vitest';
import { densityPerKm2, pctVsAverage } from './statsMath';

describe('densityPerKm2', () => {
  it('divides count by area', () => {
    expect(densityPerKm2(100, 4)).toBe(25);
  });
  it('returns 0 when area is 0 (no divide-by-zero)', () => {
    expect(densityPerKm2(100, 0)).toBe(0);
  });
});

describe('pctVsAverage', () => {
  it('is positive above the average', () => {
    expect(pctVsAverage(42, 30)).toBeCloseTo(40);
  });
  it('is negative below the average', () => {
    expect(pctVsAverage(24, 30)).toBeCloseTo(-20);
  });
  it('returns null when the average is 0', () => {
    expect(pctVsAverage(10, 0)).toBeNull();
  });
});
