/**
 * Compares two published reach payloads of one city: the straight-line build
 * ("before") against the street-network build ("after"). It repeats the map's
 * rules exactly: a place is within T minutes when metres <= T * k, a block's
 * colour class is its number of needs not within (capped at 2), and the
 * headline is the share of residents whose block has all six needs within 15
 * minutes. A block value of NONE_FOUND_METRES is never within.
 */

import { BANDS } from './calibration.js';
import type { Band } from './calibration.js';
import { NEED_IDS, NONE_FOUND_METRES } from './needs.js';
import type { ReachFeature, ReachPayload } from './reachPayload.js';

const HEADLINE_MINUTES = 15;
const COLOUR_STOPS = [5, 10, 15] as const;
const MAX_CLASS = 2;

function isWithin(metres: number, minutes: number, k: number): boolean {
  return metres !== NONE_FOUND_METRES && metres <= minutes * k;
}

function missing(feature: ReachFeature, minutes: number, k: number): number {
  return NEED_IDS.filter((id) => !isWithin(feature.properties[id], minutes, k)).length;
}

function colourClass(feature: ReachFeature, minutes: number, k: number): number {
  return Math.min(missing(feature, minutes, k), MAX_CLASS);
}

/** Share of residents with all six needs within `minutes` at metres-per-minute k. */
export function shareWithin(payload: ReachPayload, minutes: number, k: number): number {
  let residents = 0;
  let inside = 0;
  for (const { properties } of payload.features) {
    residents += properties.r;
    if (missing({ properties } as ReachFeature, minutes, k) === 0) inside += properties.r;
  }
  return residents === 0 ? 0 : inside / residents;
}

export interface ReachComparison {
  agreement: { before: Record<Band, number>; after: Record<Band, number> };
  /** meta.completeness.checks.calibrationBaseline[band].insideShare */
  baseRates: { before: Partial<Record<Band, number>>; after: Partial<Record<Band, number>> };
  /** 15 minutes, all six needs, at k, kLow and kHigh. */
  headline: {
    before: { k: number; low: number; high: number };
    after: { k: number; low: number; high: number };
  };
  /** Share of residents whose class differs, each payload judged at its own k. */
  colourChanged: Record<5 | 10 | 15, number>;
  blocks: { matched: number; onlyBefore: number; onlyAfter: number };
}

function readBaseRates(payload: ReachPayload): Partial<Record<Band, number>> {
  const checks = payload.meta.completeness.checks;
  const baseline = checks['calibrationBaseline'];
  const rates: Partial<Record<Band, number>> = {};
  if (typeof baseline !== 'object' || baseline === null) return rates;
  const byBand = baseline as Record<string, unknown>;
  for (const band of BANDS) {
    const entry = byBand[String(band)];
    if (typeof entry !== 'object' || entry === null) continue;
    const share = (entry as Record<string, unknown>)['insideShare'];
    if (typeof share === 'number') rates[band] = share;
  }
  return rates;
}

function headline(payload: ReachPayload): { k: number; low: number; high: number } {
  const { metresPerMinute, kLow, kHigh } = payload.meta;
  return {
    k: shareWithin(payload, HEADLINE_MINUTES, metresPerMinute),
    low: shareWithin(payload, HEADLINE_MINUTES, kLow),
    high: shareWithin(payload, HEADLINE_MINUTES, kHigh),
  };
}

export function compareReach(before: ReachPayload, after: ReachPayload): ReachComparison {
  const afterByH = new Map(after.features.map((f) => [f.properties.h, f]));
  const changed: Record<5 | 10 | 15, number> = { 5: 0, 10: 0, 15: 0 };
  let residents = 0;
  let matched = 0;

  for (const feature of before.features) {
    const twin = afterByH.get(feature.properties.h);
    if (!twin) continue;
    matched += 1;
    residents += feature.properties.r;
    for (const minutes of COLOUR_STOPS) {
      if (
        colourClass(feature, minutes, before.meta.metresPerMinute) !==
        colourClass(twin, minutes, after.meta.metresPerMinute)
      ) {
        changed[minutes] += feature.properties.r;
      }
    }
  }
  for (const minutes of COLOUR_STOPS) changed[minutes] = residents === 0 ? 0 : changed[minutes] / residents;

  return {
    agreement: { before: before.meta.agreement, after: after.meta.agreement },
    baseRates: { before: readBaseRates(before), after: readBaseRates(after) },
    headline: { before: headline(before), after: headline(after) },
    colourChanged: changed,
    blocks: {
      matched,
      onlyBefore: before.features.length - matched,
      onlyAfter: after.features.length - matched,
    },
  };
}
