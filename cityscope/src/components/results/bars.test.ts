import { describe, it, expect } from 'vitest';
import { barLabel, toBars } from './bars';

// Berlin Mitte, largest first, as the district stats endpoint returns it.
const MITTE = [
  { category: 'restaurant', count: 924 },
  { category: 'cafe', count: 572 },
  { category: 'playground', count: 509 },
  { category: 'bar', count: 257 },
  { category: 'park', count: 256 },
  { category: 'hotel', count: 240 },
  { category: 'pub', count: 200 },
];

describe('toBars', () => {
  it('keeps the top 5 and counts the rest', () => {
    const { rows, moreCount } = toBars(MITTE, 3350);
    expect(rows.map((r) => r.category)).toEqual(['restaurant', 'cafe', 'playground', 'bar', 'park']);
    expect(moreCount).toBe(2);
  });

  it('measures share against the total, not against the rows shown', () => {
    const { rows } = toBars(MITTE, 3350);
    expect(rows[0].share).toBeCloseTo(924 / 3350);
  });

  it('scales each bar to the largest category', () => {
    const { rows } = toBars(MITTE, 3350);
    expect(rows[0].barPct).toBe(100);
    expect(rows[1].barPct).toBeCloseTo((572 / 924) * 100);
  });

  it('sorts unsorted input, largest first, ties alphabetical', () => {
    const { rows } = toBars({ park: 3, cafe: 9, bar: 3 }, 15);
    expect(rows.map((r) => r.category)).toEqual(['cafe', 'bar', 'park']);
  });

  it('shows everything when there are fewer than 5 categories', () => {
    const { rows, moreCount } = toBars({ cafe: 2, bar: 1 }, 3);
    expect(rows).toHaveLength(2);
    expect(moreCount).toBe(0);
  });

  it('honours a custom limit', () => {
    expect(toBars(MITTE, 3350, 3).moreCount).toBe(4);
  });

  it('drops zero counts', () => {
    const { rows, moreCount } = toBars({ cafe: 2, bar: 0 }, 2);
    expect(rows.map((r) => r.category)).toEqual(['cafe']);
    expect(moreCount).toBe(0);
  });

  it('handles empty input and a zero total', () => {
    expect(toBars([], 0)).toEqual({ rows: [], moreCount: 0 });
    expect(toBars({ cafe: 1 }, 0).rows[0].share).toBe(0);
  });
});

describe('barLabel', () => {
  it('reads name, count and share, so the chart is never colour-only', () => {
    expect(barLabel({ category: 'restaurant', count: 924, share: 924 / 3350, barPct: 100 })).toBe(
      'Restaurant: 924, 28%',
    );
  });
});
