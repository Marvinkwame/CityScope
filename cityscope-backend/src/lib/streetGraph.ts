/**
 * A city's street network as typed arrays, ready for a shortest-path search.
 *
 * Built from a `StreetsFile`: ways become undirected edges between consecutive
 * nodes, weighted by their great-circle length. Only the largest connected
 * part is kept, so a stray island of mapped paths can never be where a block
 * or a place is snapped to.
 */
import type { StreetsFile } from './streets.js';

export const EARTH_RADIUS_M = 6_371_008.8;

const RAD = Math.PI / 180;

/** Great-circle distance in metres between two lng/lat points. */
export function haversineMetres(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The largest connected part only, re-indexed in file order. Undirected: each edge is in both nodes' lists. */
export interface StreetGraph {
  nodeCount: number;
  fileNodeCount: number;
  lngs: Float64Array;
  lats: Float64Array;
  /** length nodeCount + 1; node i's edges are `offsets[i]` up to `offsets[i + 1]` */
  offsets: Int32Array;
  neighbours: Int32Array;
  lengths: Float64Array;
}

function findRoot(parent: Int32Array, start: number): number {
  let root = start;
  while (parent[root] !== root) root = parent[root];
  let node = start;
  while (parent[node] !== root) {
    const next = parent[node];
    parent[node] = root;
    node = next;
  }
  return root;
}

export function buildStreetGraph(file: StreetsFile): StreetGraph {
  const n = file.nodeCount;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;

  // The lower root always wins a union, so each part's root is its lowest index.
  for (const way of file.ways) {
    for (let i = 1; i < way.length; i += 1) {
      const a = findRoot(parent, way[i - 1]);
      const b = findRoot(parent, way[i]);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }

  const size = new Int32Array(n);
  for (let i = 0; i < n; i += 1) size[findRoot(parent, i)] += 1;
  // Strictly greater keeps the part holding the lowest file index on a tie.
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < n; i += 1) {
    if (parent[i] === i && size[i] > bestSize) {
      best = i;
      bestSize = size[i];
    }
  }

  const newIndex = new Int32Array(n).fill(-1);
  let kept = 0;
  for (let i = 0; i < n; i += 1) {
    if (best >= 0 && findRoot(parent, i) === best) newIndex[i] = kept++;
  }

  const lngs = new Float64Array(kept);
  const lats = new Float64Array(kept);
  for (let i = 0; i < n; i += 1) {
    const k = newIndex[i];
    if (k >= 0) {
      lngs[k] = file.coords[2 * i];
      lats[k] = file.coords[2 * i + 1];
    }
  }

  const offsets = new Int32Array(kept + 1);
  for (const way of file.ways) {
    for (let i = 1; i < way.length; i += 1) {
      const a = newIndex[way[i - 1]];
      const b = newIndex[way[i]];
      if (a < 0 || b < 0 || a === b) continue;
      offsets[a + 1] += 1;
      offsets[b + 1] += 1;
    }
  }
  for (let i = 0; i < kept; i += 1) offsets[i + 1] += offsets[i];

  const neighbours = new Int32Array(offsets[kept]);
  const lengths = new Float64Array(offsets[kept]);
  const fill = offsets.slice(0, kept);
  for (const way of file.ways) {
    for (let i = 1; i < way.length; i += 1) {
      const a = newIndex[way[i - 1]];
      const b = newIndex[way[i]];
      if (a < 0 || b < 0 || a === b) continue;
      const metres = haversineMetres(lngs[a], lats[a], lngs[b], lats[b]);
      neighbours[fill[a]] = b;
      lengths[fill[a]++] = metres;
      neighbours[fill[b]] = a;
      lengths[fill[b]++] = metres;
    }
  }

  return { nodeCount: kept, fileNodeCount: n, lngs, lats, offsets, neighbours, lengths };
}
