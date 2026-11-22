import { describe, expect, it } from 'vitest';
import { NEED_IDS, REACH_MINUTES } from './model';
import type { ReachProperties } from './model';
import { changedBlocks, columnsFor, isWithin, missingClasses, summarise, toColumns } from './summary';

function block(h: string, r: number, sm: number, rest: number): { properties: ReachProperties } {
  return { properties: { h, r, sm, ph: rest, dr: rest, sc: rest, pk: rest, st: rest } };
}

const A = block('A', 100, 500, 500);
const B = block('B', 300, 500, 2000);
const C = block('C', 600, 65535, 65535);
const D = block('D', 1000, 800, 800);
const FIXTURE = [A, B, C];
const K = { k: 62.5, kLow: 50, kHigh: 70 };

describe('reach summary', () => {
  it('toColumns keeps residents, the total and none-found distances in payload order', () => {
    const cols = toColumns(FIXTURE);
    expect(cols.total).toBe(1000);
    expect(Array.from(cols.residents)).toEqual([100, 300, 600]);
    expect(Array.from(cols.metres.sm)).toEqual([500, 500, 65535]);
  });

  it('columnsFor builds the columns once per features array', () => {
    const features = [A, B];
    const cols = columnsFor(features);
    expect(columnsFor(features)).toBe(cols);
    expect(cols.total).toBe(400);
    expect(columnsFor([A, B])).not.toBe(cols);
  });

  it('summarise counts residents with every chosen need within the limit', () => {
    const s = summarise(toColumns(FIXTURE), NEED_IDS, 15, K);
    expect(s.share).toBeCloseTo(0.1);
    expect(s.perNeed.sm).toBeCloseTo(0.4);
    expect(s.perNeed.ph).toBeCloseTo(0.1);
  });

  it('summarise takes the range at kLow and kHigh', () => {
    // D: 800 m is outside 15 min at k 50 (750 m), inside at 62.5 (937.5 m) and 70 (1050 m).
    const s = summarise(toColumns([...FIXTURE, D]), ['sm'], 15, K);
    expect([s.low, s.share, s.high].map((x) => Math.round(x * 1000))).toEqual([200, 700, 700]);
  });

  it('summarise answers 0 for an empty payload', () => {
    expect(summarise(toColumns([]), NEED_IDS, 15, K).share).toBe(0);
  });

  it('missingClasses caps the count of chosen needs outside the limit at two, the last colour class', () => {
    expect(Array.from(missingClasses(toColumns(FIXTURE), NEED_IDS, 15, 62.5))).toEqual([0, 2, 2]);
  });

  it('missingClasses counts a single missing need as one, none-found included', () => {
    expect(Array.from(missingClasses(toColumns(FIXTURE), ['sm', 'ph'], 15, 62.5))).toEqual([0, 1, 2]);
  });

  it('changedBlocks lists every block when there is nothing to compare with', () => {
    expect(changedBlocks(null, Uint8Array.from([0, 1, 2]))).toEqual([0, 1, 2]);
    expect(changedBlocks(Uint8Array.from([0, 1]), Uint8Array.from([0, 1, 2]))).toEqual([0, 1, 2]);
  });

  it('changedBlocks lists only the blocks whose class changed', () => {
    expect(changedBlocks(Uint8Array.from([0, 1, 2, 2]), Uint8Array.from([0, 2, 2, 1]))).toEqual([1, 3]);
    expect(changedBlocks(Uint8Array.from([1, 1]), Uint8Array.from([1, 1]))).toEqual([]);
  });

  it('isWithin agrees with rounded-up minutes for every distance and limit', () => {
    const disagreements: string[] = [];
    for (const k of [62.5, 65, 66.5, 68.5, 69, 69.5])
      for (const T of REACH_MINUTES)
        for (let m = 0; m <= 8100; m++)
          if (isWithin(m, T, k) !== Math.ceil(m / k) <= T) disagreements.push(`${k}/${T}/${m}`);
    expect(disagreements).toEqual([]);
  });
});
