/**
 * Straight crossings across walkable areas (paved squares, plazas).
 *
 * OSM maps such an area as a closed outline, so a walk round it follows the
 * outline. A crossing is a straight two-node edge from an outline node to an
 * entrance (an outline node that some other way also uses), added when the
 * segment stays inside the area. The crossings are appended as ways before the
 * graph is built, so the searches need no change.
 */
import type { StreetsFile } from './streets.js';

/** An area with more outline nodes than this gets no crossings. */
export const MAX_AREA_OUTLINE_NODES = 1000;

type Pt = readonly [number, number];

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/** Whether closed segments a-b and c-d share a point (touching counts). */
function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(a, b, c)) return true;
  if (d2 === 0 && onSegment(a, b, d)) return true;
  if (d3 === 0 && onSegment(c, d, a)) return true;
  if (d4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** Even-odd ray casting over the outline's edges. */
function insideOutline(p: Pt, edges: ReadonlyArray<readonly [Pt, Pt]>): boolean {
  let inside = false;
  for (const [a, b] of edges) {
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (p[0] < x) inside = !inside;
    }
  }
  return inside;
}

export function areaCrossings(file: StreetsFile): { pairs: [number, number][]; areas: number; skipped: number } {
  // How many distinct ways use each node.
  const usage = new Map<number, number>();
  for (const way of file.ways) {
    for (const node of new Set(way)) usage.set(node, (usage.get(node) ?? 0) + 1);
  }

  const found = new Map<number, Set<number>>();
  let skipped = 0;

  for (const index of file.areas) {
    const way = file.ways[index];
    const outline = [...new Set(way)];
    if (outline.length > MAX_AREA_OUTLINE_NODES) {
      skipped++;
      continue;
    }
    const entrances = outline.filter((n) => (usage.get(n) ?? 0) >= 2);
    if (entrances.length === 0) continue;

    let latSum = 0;
    for (const n of outline) latSum += file.coords[2 * n + 1];
    const scale = Math.cos(((latSum / outline.length) * Math.PI) / 180);
    const point = (n: number): Pt => [file.coords[2 * n] * scale, file.coords[2 * n + 1]];

    const edgeNodes: [number, number][] = [];
    const neighbours = new Set<string>();
    for (let i = 0; i + 1 < way.length; i++) {
      const [a, b] = [way[i], way[i + 1]];
      if (a === b) continue;
      edgeNodes.push([a, b]);
      neighbours.add(`${a},${b}`);
      neighbours.add(`${b},${a}`);
    }
    const edges = edgeNodes.map(([a, b]) => [point(a), point(b)] as const);

    for (const e of entrances) {
      for (const n of outline) {
        if (n === e || neighbours.has(`${n},${e}`)) continue;
        const [lo, hi] = n < e ? [n, e] : [e, n];
        if (found.get(lo)?.has(hi)) continue;
        const p = point(n);
        const q = point(e);
        let clear = true;
        for (let k = 0; k < edgeNodes.length && clear; k++) {
          const [a, b] = edgeNodes[k];
          if (a === n || a === e || b === n || b === e) continue;
          if (segmentsMeet(p, q, edges[k][0], edges[k][1])) clear = false;
        }
        if (!clear) continue;
        if (!insideOutline([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], edges)) continue;
        let set = found.get(lo);
        if (!set) found.set(lo, (set = new Set()));
        set.add(hi);
      }
    }
  }

  const pairs: [number, number][] = [];
  for (const lo of [...found.keys()].sort((a, b) => a - b)) {
    for (const hi of [...found.get(lo)!].sort((a, b) => a - b)) pairs.push([lo, hi]);
  }
  return { pairs, areas: file.areas.length, skipped };
}

/** A copy of the file with each crossing appended as a two-node way. */
export function withCrossings(file: StreetsFile, pairs: ReadonlyArray<readonly [number, number]>): StreetsFile {
  return { ...file, ways: [...file.ways, ...pairs.map(([a, b]) => [a, b])] };
}
