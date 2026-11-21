/**
 * Nearest street node to a point, from a grid of cells over the graph's nodes.
 *
 * Cells are `cellDegrees` square and hold node indexes in one flat array
 * (cell slot -> start offset), so a London-sized graph costs about 4 bytes a
 * node plus the cell table. A search scans the point's cell, then rings of
 * cells around it, and stops once no unscanned cell can hold a closer node.
 */
import { haversineMetres } from './streetGraph.js';
import type { StreetGraph } from './streetGraph.js';

const METRES_PER_DEGREE = 111_195;

function cosOfLat(degrees: number): number {
  return Math.max(0.01, Math.cos(Math.min(89.4, degrees) * (Math.PI / 180)));
}

export class NodeIndex {
  private readonly minLng: number;
  private readonly minLat: number;
  private readonly cols: number;
  private readonly rows: number;
  /** cell key -> slot in `starts` (empty cells have none) */
  private readonly slotOf = new Map<number, number>();
  private readonly starts: Int32Array;
  private readonly members: Int32Array;

  constructor(
    private readonly graph: StreetGraph,
    private readonly cellDegrees = 0.005,
  ) {
    const n = graph.nodeCount;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (let i = 0; i < n; i += 1) {
      minLng = Math.min(minLng, graph.lngs[i]);
      maxLng = Math.max(maxLng, graph.lngs[i]);
      minLat = Math.min(minLat, graph.lats[i]);
      maxLat = Math.max(maxLat, graph.lats[i]);
    }
    this.minLng = n > 0 ? minLng : 0;
    this.minLat = n > 0 ? minLat : 0;
    this.cols = n > 0 ? Math.floor((maxLng - minLng) / cellDegrees) + 1 : 0;
    this.rows = n > 0 ? Math.floor((maxLat - minLat) / cellDegrees) + 1 : 0;

    const slots = new Int32Array(n);
    const counts: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const key = this.keyOf(this.colOf(graph.lngs[i]), this.rowOf(graph.lats[i]));
      let slot = this.slotOf.get(key);
      if (slot === undefined) {
        slot = counts.length;
        this.slotOf.set(key, slot);
        counts.push(0);
      }
      counts[slot] += 1;
      slots[i] = slot;
    }
    this.starts = new Int32Array(counts.length + 1);
    for (let s = 0; s < counts.length; s += 1) this.starts[s + 1] = this.starts[s] + counts[s];
    const fill = this.starts.slice(0, counts.length);
    this.members = new Int32Array(n);
    for (let i = 0; i < n; i += 1) this.members[fill[slots[i]]++] = i;
  }

  private colOf(lng: number): number {
    return Math.floor((lng - this.minLng) / this.cellDegrees);
  }

  private rowOf(lat: number): number {
    return Math.floor((lat - this.minLat) / this.cellDegrees);
  }

  private keyOf(col: number, row: number): number {
    return col * this.rows + row;
  }

  /** The nearest node to the point and its distance in metres. Always answers on a non-empty graph, widening ring by ring. */
  nearest(lng: number, lat: number): { node: number; metres: number } {
    if (this.graph.nodeCount === 0) throw new Error('Cannot search an empty street graph');
    const { lngs, lats } = this.graph;
    const col = this.colOf(lng);
    const row = this.rowOf(lat);
    // Rings past the farthest edge of the grid hold nothing.
    const maxRing = Math.max(
      Math.abs(col),
      Math.abs(col - (this.cols - 1)),
      Math.abs(row),
      Math.abs(row - (this.rows - 1)),
    );

    let bestNode = -1;
    let bestMetres = Infinity;
    const scan = (c: number, r: number): void => {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
      const slot = this.slotOf.get(this.keyOf(c, r));
      if (slot === undefined) return;
      for (let m = this.starts[slot]; m < this.starts[slot + 1]; m += 1) {
        const node = this.members[m];
        const metres = haversineMetres(lng, lat, lngs[node], lats[node]);
        if (metres < bestMetres) {
          bestMetres = metres;
          bestNode = node;
        }
      }
    };

    for (let ring = 0; ring <= maxRing; ring += 1) {
      if (ring === 0) {
        scan(col, row);
      } else {
        for (let c = col - ring; c <= col + ring; c += 1) {
          scan(c, row - ring);
          scan(c, row + ring);
        }
        for (let r = row - ring + 1; r <= row + ring - 1; r += 1) {
          scan(col - ring, r);
          scan(col + ring, r);
        }
      }
      if (bestNode >= 0) {
        // Anything unscanned is more than `ring` cells away in latitude or longitude.
        const gap = ring * this.cellDegrees;
        const lowest = gap * METRES_PER_DEGREE * Math.min(1, cosOfLat(Math.abs(lat) + gap + this.cellDegrees));
        if (bestMetres <= lowest) break;
      }
    }
    return { node: bestNode, metres: bestMetres };
  }
}
