/** Headline arithmetic over a city's blocks, in typed columns so one pass fits in a frame. */

import { NEED_IDS } from './model';
import type { NeedId, ReachProperties } from './model';

export interface ReachColumns {
  ids: string[];
  residents: Float64Array;
  total: number;
  metres: Record<NeedId, Uint16Array>;
}

export function toColumns(features: ReadonlyArray<{ properties: ReachProperties }>): ReachColumns {
  const n = features.length;
  const ids: string[] = new Array<string>(n);
  const residents = new Float64Array(n);
  const metres = {} as Record<NeedId, Uint16Array>;
  for (const id of NEED_IDS) metres[id] = new Uint16Array(n);

  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = features[i].properties;
    ids[i] = p.h;
    residents[i] = p.r;
    total += p.r;
    for (const id of NEED_IDS) metres[id][i] = p[id];
  }
  return { ids, residents, total, metres };
}

/** True when the straight-line metres fit the limit at k metres per minute. */
export function isWithin(metres: number, minutes: number, k: number): boolean {
  return metres <= minutes * k;
}

export interface ReachSummary {
  share: number;
  low: number;
  high: number;
  perNeed: Record<NeedId, number>;
}

/** One pass over the blocks: the share with every chosen need within the limit at k, kLow and kHigh, and each need's share at k. */
export function summarise(
  cols: ReachColumns,
  needs: readonly NeedId[],
  minutes: number,
  k: { k: number; kLow: number; kHigh: number },
): ReachSummary {
  const perNeed = {} as Record<NeedId, number>;
  for (const id of NEED_IDS) perNeed[id] = 0;
  if (cols.total === 0) return { share: 0, low: 0, high: 0, perNeed };

  const limit = minutes * k.k;
  const limitLow = minutes * k.kLow;
  const limitHigh = minutes * k.kHigh;
  const chosen = needs.map((id) => cols.metres[id]);
  // Every need's column and running total sit in arrays: looking them up and
  // adding to them by name for each block made this pass several times slower.
  const every = NEED_IDS.map((id) => cols.metres[id]);
  const withinNeed = new Float64Array(every.length);

  let all = 0;
  let allLow = 0;
  let allHigh = 0;
  for (let i = 0; i < cols.residents.length; i++) {
    const r = cols.residents[i];
    let worst = 0;
    for (const m of chosen) if (m[i] > worst) worst = m[i];
    if (worst <= limit) all += r;
    if (worst <= limitLow) allLow += r;
    if (worst <= limitHigh) allHigh += r;
    for (let n = 0; n < every.length; n++) if (every[n][i] <= limit) withinNeed[n] += r;
  }

  NEED_IDS.forEach((id, n) => {
    perNeed[id] = withinNeed[n] / cols.total;
  });
  return { share: all / cols.total, low: allLow / cols.total, high: allHigh / cols.total, perNeed };
}

/**
 * Each block's colour class, the feature-state input: the number of chosen
 * needs outside the limit, capped at two (0 all met, 1 one missing, 2 two or
 * more). Storing the class rather than the full count means a block's state
 * changes only when its colour does.
 */
export function missingClasses(cols: ReachColumns, needs: readonly NeedId[], minutes: number, k: number): Uint8Array {
  const limit = minutes * k;
  const chosen = needs.map((id) => cols.metres[id]);
  const out = new Uint8Array(cols.residents.length);
  for (let i = 0; i < out.length; i++) {
    let missing = 0;
    for (const m of chosen) if (m[i] > limit && ++missing === 2) break;
    out[i] = missing;
  }
  return out;
}

/**
 * The blocks whose class differs between two recolours, so only those are
 * written: Mapbox re-evaluates the paint of every block whose state is set,
 * changed or not. With nothing to compare with (the first colouring, or a new
 * city's blocks), every block.
 */
export function changedBlocks(previous: Uint8Array | null, next: Uint8Array): number[] {
  const changed: number[] = [];
  const compare = previous !== null && previous.length === next.length;
  for (let i = 0; i < next.length; i++) if (!compare || previous[i] !== next[i]) changed.push(i);
  return changed;
}
