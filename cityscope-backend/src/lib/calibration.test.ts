import { describe, it, expect } from 'vitest';
import {
  AGREEMENT_BAR,
  BANDS,
  BOOTSTRAP_ROUNDS,
  CALIBRATION_SAMPLE,
  CALIBRATION_SEED,
  agreement,
  agreementByBand,
  bootstrapK,
  cityPasses,
  coherentRange,
  fitK,
  kCandidates,
  passingStops,
  predictsInside,
  splitSample,
} from './calibration';
import type { Observation } from './calibration';

// Each band T has a place at 68·T metres that the isochrone reaches and one at
// 72·T that it does not, so any k in [68, 72) classifies every one correctly.
function perfectObservations(): Observation[] {
  const obs: Observation[] = [];
  for (const cell of ['cell-a', 'cell-b']) {
    for (const band of BANDS) {
      obs.push({ cell, need: 'sm', band, metres: 68 * band, inside: true });
      obs.push({ cell, need: 'ph', band, metres: 72 * band, inside: false });
    }
  }
  return obs;
}

describe('constants', () => {
  it('fixes the values the spec names', () => {
    expect(BANDS).toEqual([5, 10, 15, 20]);
    expect(AGREEMENT_BAR).toBe(0.8);
    expect(CALIBRATION_SAMPLE).toBe(60);
    expect(BOOTSTRAP_ROUNDS).toBe(200);
    expect(CALIBRATION_SEED).toBe(20261017);
  });
});

describe('kCandidates', () => {
  it('runs from 30 to 150 in steps of 0.5', () => {
    const ks = kCandidates();
    expect(ks[0]).toBe(30);
    expect(ks[1]).toBe(30.5);
    expect(ks[ks.length - 1]).toBe(150);
    expect(ks).toHaveLength(241);
  });
});

describe('predictsInside', () => {
  it('is inside when metres / k is at most the band, so the boundary counts as inside', () => {
    expect(predictsInside(340, 68, 5)).toBe(true);
    expect(predictsInside(341, 68, 5)).toBe(false);
  });
});

describe('agreement', () => {
  it('is the share of observations the estimate classifies correctly', () => {
    const obs = perfectObservations();
    expect(agreement(obs, 69.5)).toBe(1);
    expect(agreement(obs, 60)).toBe(0.5);
  });

  it('predicts a none-found distance outside, which agrees with an outside observation at every k', () => {
    const obs: Observation[] = [{ cell: 'a', need: 'pk', band: 20, metres: 65535, inside: false }];
    for (const k of kCandidates()) {
      expect(agreement(obs, k)).toBe(1);
    }
  });
});

describe('fitK', () => {
  it('takes the middle of the tied best candidates', () => {
    // 68, 68.5, … 71.5 are all perfect: eight ties, and index 3 is 69.5.
    expect(fitK(perfectObservations())).toBe(69.5);
  });

  it('picks the single best candidate when there is one', () => {
    // Only k = 100 puts 500 m inside the 5-minute band and 501 m outside it.
    const obs: Observation[] = [
      { cell: 'a', need: 'sm', band: 5, metres: 500, inside: true },
      { cell: 'a', need: 'sm', band: 5, metres: 501, inside: false },
    ];
    expect(fitK(obs)).toBe(100);
  });

  it('refuses to fit nothing', () => {
    expect(() => fitK([])).toThrow();
  });
});

describe('agreementByBand', () => {
  it('reports each band on its own', () => {
    const obs = perfectObservations();
    expect(agreementByBand(obs, 69.5)).toEqual({ 5: 1, 10: 1, 15: 1, 20: 1 });
    expect(agreementByBand(obs, 60)).toEqual({ 5: 0.5, 10: 0.5, 15: 0.5, 20: 0.5 });
  });

  it('reads a band with no observations as 0, so it cannot pass the bar', () => {
    const obs: Observation[] = [{ cell: 'a', need: 'sm', band: 10, metres: 680, inside: true }];
    expect(agreementByBand(obs, 68)).toEqual({ 5: 0, 10: 1, 15: 0, 20: 0 });
  });
});

describe('bootstrapK', () => {
  it('collapses to the fitted k when every resample fits the same', () => {
    const obs = perfectObservations();
    expect(bootstrapK(obs, 200, 20261017)).toEqual({ kLow: 69.5, kHigh: 69.5 });
    expect(bootstrapK(obs, 200, 20261017)).toEqual({ kLow: 69.5, kHigh: 69.5 });
  });

  it('resamples whole cells, so one cell with a different k pulls the range apart', () => {
    // Cell "slow" is perfectly classified by k in [50, 52), cell "fast" by [90, 92).
    const obs: Observation[] = [];
    for (const band of BANDS) {
      obs.push({ cell: 'slow', need: 'sm', band, metres: 50 * band, inside: true });
      obs.push({ cell: 'slow', need: 'sm', band, metres: 52 * band, inside: false });
      obs.push({ cell: 'fast', need: 'sm', band, metres: 90 * band, inside: true });
      obs.push({ cell: 'fast', need: 'sm', band, metres: 92 * band, inside: false });
    }
    const { kLow, kHigh } = bootstrapK(obs, 200, 20261017);
    // A resample of only "slow" fits near 50, one of only "fast" near 90.
    expect(kLow).toBeLessThan(55);
    expect(kHigh).toBeGreaterThan(85);
  });

  it('gives the same range for the same seed', () => {
    const obs: Observation[] = [];
    for (let c = 0; c < 6; c++) {
      for (const band of BANDS) {
        obs.push({ cell: `c${c}`, need: 'sm', band, metres: (60 + c * 5) * band, inside: c % 2 === 0 });
      }
    }
    expect(bootstrapK(obs, 50, 3)).toEqual(bootstrapK(obs, 50, 3));
  });

  it('keeps kLow at or below kHigh', () => {
    const obs = perfectObservations();
    const { kLow, kHigh } = bootstrapK(obs, 20, 1);
    expect(kLow).toBeLessThanOrEqual(kHigh);
  });

  it('refuses to resample nothing', () => {
    expect(() => bootstrapK([], 200, 1)).toThrow();
  });
});

describe('splitSample', () => {
  it('deals the sample out alternately: even positions fit, odd positions are held out', () => {
    expect(splitSample(['a', 'b', 'c', 'd', 'e'])).toEqual({
      fit: ['a', 'c', 'e'],
      heldOut: ['b', 'd'],
    });
  });

  it('splits a full sample into two halves of 30 that between them hold every cell once', () => {
    const sample = Array.from({ length: CALIBRATION_SAMPLE }, (_, i) => i);
    const { fit, heldOut } = splitSample(sample);
    expect(fit).toHaveLength(30);
    expect(heldOut).toHaveLength(30);
    expect(fit[0]).toBe(0);
    expect(fit[29]).toBe(58);
    expect(heldOut[0]).toBe(1);
    expect(heldOut[29]).toBe(59);
    expect([...fit, ...heldOut].sort((a, b) => a - b)).toEqual(sample);
  });

  it('handles an empty sample', () => {
    expect(splitSample([])).toEqual({ fit: [], heldOut: [] });
  });
});

describe('coherentRange', () => {
  it('leaves a range alone when k is inside it, ends included', () => {
    expect(coherentRange(70, { kLow: 65, kHigh: 75 })).toEqual({ kLow: 65, kHigh: 75 });
    expect(coherentRange(65, { kLow: 65, kHigh: 75 })).toEqual({ kLow: 65, kHigh: 75 });
    expect(coherentRange(75, { kLow: 65, kHigh: 75 })).toEqual({ kLow: 65, kHigh: 75 });
  });

  it('lowers kLow to k when k is below the range', () => {
    expect(coherentRange(60, { kLow: 65, kHigh: 75 })).toEqual({ kLow: 60, kHigh: 75 });
  });

  it('raises kHigh to k when k is above the range', () => {
    expect(coherentRange(80, { kLow: 65, kHigh: 75 })).toEqual({ kLow: 65, kHigh: 80 });
  });
});

describe('passingStops', () => {
  it('lists the bands at or above the bar, in order', () => {
    expect(passingStops({ 5: 0.79, 10: 0.8, 15: 0.92, 20: 0.85 })).toEqual([10, 15, 20]);
  });

  it('takes another bar when given one', () => {
    expect(passingStops({ 5: 0.79, 10: 0.8, 15: 0.92, 20: 0.85 }, 0.9)).toEqual([15]);
  });
});

describe('cityPasses', () => {
  it('needs the 15-minute band', () => {
    expect(cityPasses([10, 20])).toBe(false);
    expect(cityPasses([5, 15])).toBe(true);
    expect(cityPasses([])).toBe(false);
  });
});
