import { describe, expect, it } from 'vitest';
import { compareReach, parseCompareArgs, shareWithin } from './reachCompare';
import type { ReachFeature, ReachPayload } from './reachPayload';

function block(h: string, r: number, metres: number[]): ReachFeature {
  const [sm, ph, dr, sc, pk, st] = metres;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[]] },
    properties: { h, r, sm, ph, dr, sc, pk, st },
  };
}

function payload(k: number, features: ReachFeature[]): ReachPayload {
  return {
    type: 'FeatureCollection',
    meta: {
      metresPerMinute: k,
      kLow: k - 10,
      kHigh: k + 10,
      agreement: { 5: 0.5, 10: 0.6, 15: 0.7, 20: 0.8 },
      completeness: { checks: { calibrationBaseline: { 15: { insideShare: 0.4, alwaysInsideAgreement: 0.6 } } } },
    },
    features,
  } as unknown as ReachPayload;
}

// k = 100: 5 minutes is 500 m, 15 minutes is 1500 m.
const before = payload(100, [
  block('a', 10, [100, 100, 100, 100, 100, 100]), // all within 5
  block('b', 20, [100, 100, 100, 100, 100, 1400]), // all within 15, not 5 (st)
  block('c', 30, [100, 100, 100, 100, 100, 65535]), // never all
]);

describe('shareWithin', () => {
  it('counts residents of blocks with all six needs within the time', () => {
    expect(shareWithin(before, 15, 100)).toBeCloseTo(30 / 60);
    expect(shareWithin(before, 5, 100)).toBeCloseTo(10 / 60);
    expect(shareWithin(before, 15, 140)).toBeCloseTo(30 / 60);
    expect(shareWithin(before, 10, 140)).toBeCloseTo(30 / 60);
  });
});

describe('compareReach', () => {
  it('judges each payload at its own k and weights by residents', () => {
    // after: k 200 (5 min = 1000 m). a stays class 0; b: 900 m is now within 5, so 1 -> 0; c: unchanged (1)
    const after = payload(200, [
      block('a', 10, [100, 100, 100, 100, 100, 100]),
      block('b', 20, [100, 100, 100, 100, 100, 900]),
      block('c', 30, [100, 100, 100, 100, 100, 65535]),
    ]);
    const result = compareReach(before, after);
    expect(result.colourChanged[5]).toBeCloseTo(20 / 60); // only b changes (1 missing -> 0)
    expect(result.colourChanged[15]).toBe(0);
    expect(result.headline.before.k).toBeCloseTo(30 / 60);
    expect(result.agreement.before[15]).toBe(0.7);
    expect(result.baseRates.before[15]).toBe(0.4);
    expect(result.baseRates.after[10]).toBeUndefined();
  });

  it('counts a block going from class 0 to 1 by its residents', () => {
    const after = payload(100, [
      block('a', 10, [100, 100, 100, 100, 100, 900]),
      block('b', 20, [100, 100, 100, 100, 100, 1400]),
      block('c', 30, [100, 100, 100, 100, 100, 65535]),
    ]);
    expect(compareReach(before, after).colourChanged[5]).toBeCloseTo(10 / 60);
  });

  it('matches blocks by h and leaves unmatched ones out of the shares', () => {
    const after = payload(100, [
      block('a', 10, [100, 100, 100, 100, 100, 900]),
      block('z', 99, [1, 1, 1, 1, 1, 1]),
    ]);
    const result = compareReach(before, after);
    expect(result.blocks).toEqual({ matched: 1, onlyBefore: 2, onlyAfter: 1 });
    expect(result.colourChanged[5]).toBe(1);
  });

  it('gives no rates, not a throw, for an older payload without completeness, a baseline or agreement', () => {
    const bare = payload(100, before.features);
    delete (bare.meta as unknown as Record<string, unknown>).completeness;
    delete (bare.meta as unknown as Record<string, unknown>).agreement;
    const noBaseline = payload(100, before.features);
    (noBaseline.meta.completeness as { checks: Record<string, unknown> }).checks = {};
    const result = compareReach(bare, noBaseline);
    expect(result.baseRates).toEqual({ before: {}, after: {} });
    expect(result.agreement.before).toEqual({});
    expect(result.agreement.after[15]).toBe(0.7);
  });
});

describe('parseCompareArgs', () => {
  it('reads a city and an optional --before path', () => {
    expect(parseCompareArgs(['berlin'])).toEqual({ cityId: 'berlin', beforePath: null });
    expect(parseCompareArgs(['berlin', '--before', 'data/reach-before/street-v1/berlin.json'])).toEqual({
      cityId: 'berlin',
      beforePath: 'data/reach-before/street-v1/berlin.json',
    });
    expect(parseCompareArgs([])).toBeNull();
    expect(parseCompareArgs(['--before', 'x.json'])).toBeNull();
    expect(parseCompareArgs(['berlin', '--before'])).toBeNull();
    expect(parseCompareArgs(['berlin', '--before', ''])).toBeNull();
  });
});
