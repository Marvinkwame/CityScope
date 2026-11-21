/**
 * Each block's nearest place by street, for one need: the places become
 * sources of one multi-source search, and every block reads its answer off the
 * result, with a simplified line of the way there.
 */
import type { NodeIndex } from './nodeIndex.js';
import { pathToSource, searchFromSources } from './multiSourceSearch.js';
import type { Source } from './multiSourceSearch.js';
import { haversineMetres } from './streetGraph.js';
import type { StreetGraph } from './streetGraph.js';
import { simplifyWalk } from './walks.js';

export const PARK_ENTRY_SPACING_METRES = 25;
export const PARK_ENTRY_JOIN_METRES = 30;
export const FAR_FROM_NETWORK_METRES = 150;

/** The most metres a row stores (the payload's 16-bit field, with one value kept back). */
const MAX_METRES = 65534;

export interface BlockInput {
  h3: string;
  lng: number;
  lat: number;
}
export interface BlockJoin extends BlockInput {
  node: number;
  metres: number;
}
/** A POI, or one entry point of a park (several rows share a park's placeId). */
export interface PlaceInput {
  placeId: number;
  lng: number;
  lat: number;
}
export interface NetworkRow {
  h3: string;
  placeId: number;
  metres: number;
  walk: [number, number][];
  straightMetres: number;
}
export interface NeedStats {
  rows: number;
  unreached: number;
  medianDetour: number | null;
}

/** Joins each block to its nearest street node, and lists the blocks more than 150 m from the network. */
export function joinBlocks(
  index: NodeIndex,
  blocks: readonly BlockInput[],
): { joins: BlockJoin[]; far: { h3: string; metres: number }[] } {
  const joins: BlockJoin[] = [];
  const far: { h3: string; metres: number }[] = [];
  for (const block of blocks) {
    const { node, metres } = index.nearest(block.lng, block.lat);
    joins.push({ ...block, node, metres });
    if (metres > FAR_FROM_NETWORK_METRES) far.push({ h3: block.h3, metres });
  }
  return { joins, far };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function nearestByStreet(
  graph: StreetGraph,
  index: NodeIndex,
  joins: readonly BlockJoin[],
  places: readonly PlaceInput[],
  kind: 'poi' | 'park',
): { rows: NetworkRow[]; stats: NeedStats } {
  // A total order that does not depend on the input order; a point's rank is its position here.
  const ordered = [...places].sort((a, b) => a.placeId - b.placeId || a.lng - b.lng || a.lat - b.lat);
  const joined = ordered.map((p) => index.nearest(p.lng, p.lat));

  const sources: Source[] = [];
  if (kind === 'poi') {
    joined.forEach((j, rank) => sources.push({ node: j.node, cost: j.metres, rank }));
  } else {
    // Entry points within the join distance count; a park with none uses its closest one.
    let start = 0;
    while (start < ordered.length) {
      let end = start;
      while (end < ordered.length && ordered[end].placeId === ordered[start].placeId) end += 1;
      let closest = start;
      let any = false;
      for (let r = start; r < end; r += 1) {
        if (joined[r].metres <= PARK_ENTRY_JOIN_METRES) {
          any = true;
          sources.push({ node: joined[r].node, cost: joined[r].metres, rank: r });
        }
        if (joined[r].metres < joined[closest].metres) closest = r;
      }
      if (!any) sources.push({ node: joined[closest].node, cost: joined[closest].metres, rank: closest });
      start = end;
    }
  }

  const result = searchFromSources(graph, sources);
  const rows: NetworkRow[] = [];
  const detours: number[] = [];
  for (const join of joins) {
    const rank = result.rank[join.node];
    if (rank < 0) continue;
    const place = ordered[rank];
    const line: [number, number][] = [[join.lng, join.lat]];
    for (const node of pathToSource(result, join.node)) line.push([graph.lngs[node], graph.lats[node]]);
    line.push([place.lng, place.lat]);
    const metres = Math.min(Math.round(join.metres + result.dist[join.node]), MAX_METRES);
    const straightMetres = haversineMetres(join.lng, join.lat, place.lng, place.lat);
    rows.push({ h3: join.h3, placeId: place.placeId, metres, walk: simplifyWalk(line), straightMetres });
    if (straightMetres > 0) detours.push(metres / straightMetres);
  }
  return {
    rows,
    stats: { rows: rows.length, unreached: joins.length - rows.length, medianDetour: median(detours) },
  };
}
