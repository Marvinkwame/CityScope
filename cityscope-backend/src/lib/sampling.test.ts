import { describe, it, expect } from 'vitest';
import { mulberry32, weightedSample } from './sampling';

const ITEMS = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, weight: i + 1 }));

describe('mulberry32', () => {
  it('stays within [0, 1)', () => {
    for (const seed of [0, 1, 20261017, 2 ** 31, -5]) {
      const next = mulberry32(seed);
      for (let i = 0; i < 2000; i++) {
        const r = next();
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
      }
    }
  });

  it('gives the same stream for the same seed, and a different one for another', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });
});

describe('weightedSample', () => {
  it('gives the same sample for the same seed', () => {
    expect(weightedSample(ITEMS, 8, 42)).toEqual(weightedSample(ITEMS, 8, 42));
  });

  it('gives n distinct ids', () => {
    const sample = weightedSample(ITEMS, 8, 42);
    expect(sample).toHaveLength(8);
    expect(new Set(sample).size).toBe(8);
  });

  it('returns every positive-weight item when asked for more than exist', () => {
    const sample = weightedSample(ITEMS, 500, 1);
    expect(sample).toHaveLength(ITEMS.length);
    expect([...sample].sort()).toEqual(ITEMS.map((i) => i.id).sort());
  });

  it('never chooses a weight of 0 or below', () => {
    const items = [
      { id: 'zero', weight: 0 },
      { id: 'negative', weight: -3 },
      { id: 'a', weight: 1 },
      { id: 'b', weight: 2 },
    ];
    for (let seed = 1; seed <= 200; seed++) {
      expect(weightedSample(items, 4, seed).sort()).toEqual(['a', 'b']);
    }
  });

  it('returns nothing for n = 0 or no items', () => {
    expect(weightedSample(ITEMS, 0, 1)).toEqual([]);
    expect(weightedSample([], 5, 1)).toEqual([]);
  });

  it('favours heavy items: weights 1 versus 99 pick the heavy one at least 900 times in 1000 seeds', () => {
    const items = [
      { id: 'light', weight: 1 },
      { id: 'heavy', weight: 99 },
    ];
    let heavy = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (weightedSample(items, 1, seed)[0] === 'heavy') heavy++;
    }
    expect(heavy).toBeGreaterThanOrEqual(900);
  });
});
