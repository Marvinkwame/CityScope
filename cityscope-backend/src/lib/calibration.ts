/**
 * Calibrating the walking estimate.
 *
 * Everyday reach estimates a walk as straight-line metres ÷ k, where k is the
 * number of straight-line metres a person covers in a walking minute. k is not
 * assumed: it is fitted per city against Mapbox walking isochrones.
 *
 * An observation is one (cell, need, band) check: the straight-line distance
 * from a cell's centre to its nearest place for the need, and whether that
 * place lies inside the isochrone for the band. The estimate predicts the
 * place is inside a band of T minutes when metres / k ≤ T, and agrees with
 * Mapbox when that prediction is right.
 */

import { mulberry32 } from './sampling.js';

export type Band = 5 | 10 | 15 | 20;

/** The walking times checked, in minutes. */
export const BANDS: readonly Band[] = [5, 10, 15, 20];

/** A band passes when the estimate agrees with Mapbox at least this often. */
export const AGREEMENT_BAR = 0.8;

/** Cells sampled per city: the first half fits k, the second half is held out. */
export const CALIBRATION_SAMPLE = 60;

/** Bootstrap resamples behind the range reported around k. */
export const BOOTSTRAP_ROUNDS = 200;

/** Fixed, so a rerun samples and resamples identically. */
export const CALIBRATION_SEED = 20261017;

export interface Observation {
  cell: string;
  need: string;
  band: Band;
  /** Straight-line metres to the nearest place. 65535 means the city has none. */
  metres: number;
  /** Whether the Mapbox isochrone for the band reaches that place. */
  inside: boolean;
}

const K_MIN = 30;
const K_MAX = 150;
const K_STEP = 0.5;

/** The values of k tried: 30, 30.5, … 150 straight-line metres per minute. */
export function kCandidates(): number[] {
  const count = Math.round((K_MAX - K_MIN) / K_STEP) + 1;
  return Array.from({ length: count }, (_, i) => K_MIN + i * K_STEP);
}

/**
 * Whether the estimate puts a place inside a band. Distances at the none-found
 * value are far beyond every band at every candidate k, so they are predicted
 * outside.
 */
export function predictsInside(metres: number, k: number, band: Band): boolean {
  return metres / k <= band;
}

function agreeingCount(obs: readonly Observation[], k: number): number {
  let agreeing = 0;
  for (const o of obs) {
    if (predictsInside(o.metres, k, o.band) === o.inside) agreeing++;
  }
  return agreeing;
}

/** The share of observations the estimate classifies correctly at k. */
export function agreement(obs: readonly Observation[], k: number): number {
  return obs.length === 0 ? 0 : agreeingCount(obs, k) / obs.length;
}

/**
 * The k with the best agreement. Candidates that tie are all equally good, and
 * the middle one is taken: `ties[floor((ties.length - 1) / 2)]`, the lower
 * middle when the count is even. Counts are compared as whole numbers, so
 * rounding cannot split a tie.
 */
export function fitK(obs: readonly Observation[]): number {
  if (obs.length === 0) {
    throw new Error('Cannot fit k without observations');
  }

  let best = -1;
  let ties: number[] = [];
  for (const k of kCandidates()) {
    const count = agreeingCount(obs, k);
    if (count > best) {
      best = count;
      ties = [k];
    } else if (count === best) {
      ties.push(k);
    }
  }
  return ties[Math.floor((ties.length - 1) / 2)];
}

/**
 * Agreement within each band. A band with no observations reads as 0, so it
 * cannot pass the bar on no evidence.
 */
export function agreementByBand(obs: readonly Observation[], k: number): Record<Band, number> {
  const result: Record<Band, number> = { 5: 0, 10: 0, 15: 0, 20: 0 };
  for (const band of BANDS) {
    result[band] = agreement(
      obs.filter((o) => o.band === band),
      k,
    );
  }
  return result;
}

/**
 * The range k could plausibly take, by bootstrap. The unit resampled is the
 * cell, not the observation: a cell's observations share one place in the
 * city and are not independent, so resampling them one by one would report
 * more certainty than the sample holds.
 *
 * Cells are the unique `cell` values in order of first appearance. Each round
 * draws that many cells with replacement from a single mulberry32(seed)
 * stream, refits k on their observations, and the fitted values are sorted.
 * The range is the 5th and 95th percentile, read by index.
 */
export function bootstrapK(
  obs: readonly Observation[],
  rounds: number,
  seed: number,
): { kLow: number; kHigh: number } {
  if (obs.length === 0 || !(rounds >= 1)) {
    throw new Error('Cannot bootstrap without observations and at least one round');
  }

  const byCell = new Map<string, Observation[]>();
  for (const o of obs) {
    const group = byCell.get(o.cell);
    if (group) group.push(o);
    else byCell.set(o.cell, [o]);
  }
  const cells = [...byCell.values()];

  const next = mulberry32(seed);
  const ks: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const resample: Observation[] = [];
    for (let i = 0; i < cells.length; i++) {
      resample.push(...cells[Math.floor(next() * cells.length)]);
    }
    ks.push(fitK(resample));
  }

  ks.sort((a, b) => a - b);
  return {
    kLow: ks[Math.floor(0.05 * (rounds - 1))],
    kHigh: ks[Math.ceil(0.95 * (rounds - 1))],
  };
}

/** The bands whose agreement reaches the bar, in order. */
export function passingStops(byBand: Record<Band, number>, bar: number = AGREEMENT_BAR): Band[] {
  return BANDS.filter((band) => byBand[band] >= bar);
}

/** A city passes when its 15-minute band does. */
export function cityPasses(stops: readonly Band[]): boolean {
  return stops.includes(15);
}
