/**
 * One shortest-path search from many starting places at once, over a street
 * graph: every node learns the metres to its nearest source, which source that
 * is (by rank), and the next node on the way there.
 */
import type { StreetGraph } from './streetGraph.js';

/** A starting place: its node, the join distance already walked, and its rank (its position among the need's places, by id). */
export interface Source {
  node: number;
  cost: number;
  rank: number;
}

/** Per node: metres to its nearest source, that source's rank, and the next node towards it. Unreached: Infinity, -1, -1. A source node's prev is -1. */
export interface SearchResult {
  dist: Float64Array;
  rank: Int32Array;
  prev: Int32Array;
}

/** A binary min-heap on (dist, rank, node) held in parallel typed arrays. */
class Heap {
  private dists: Float64Array;
  private ranks: Int32Array;
  private nodes: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.dists = new Float64Array(capacity);
    this.ranks = new Int32Array(capacity);
    this.nodes = new Int32Array(capacity);
  }

  private less(a: number, b: number): boolean {
    if (this.dists[a] !== this.dists[b]) return this.dists[a] < this.dists[b];
    if (this.ranks[a] !== this.ranks[b]) return this.ranks[a] < this.ranks[b];
    return this.nodes[a] < this.nodes[b];
  }

  private swap(a: number, b: number): void {
    const d = this.dists[a];
    this.dists[a] = this.dists[b];
    this.dists[b] = d;
    const r = this.ranks[a];
    this.ranks[a] = this.ranks[b];
    this.ranks[b] = r;
    const n = this.nodes[a];
    this.nodes[a] = this.nodes[b];
    this.nodes[b] = n;
  }

  private grow(): void {
    const capacity = this.dists.length * 2;
    const dists = new Float64Array(capacity);
    const ranks = new Int32Array(capacity);
    const nodes = new Int32Array(capacity);
    dists.set(this.dists);
    ranks.set(this.ranks);
    nodes.set(this.nodes);
    this.dists = dists;
    this.ranks = ranks;
    this.nodes = nodes;
  }

  push(dist: number, rank: number, node: number): void {
    if (this.size === this.dists.length) this.grow();
    let i = this.size;
    this.size += 1;
    this.dists[i] = dist;
    this.ranks[i] = rank;
    this.nodes[i] = node;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Removes the smallest entry; read it through `topDist`, `topRank` and `topNode` taken just before. */
  pop(): void {
    this.size -= 1;
    if (this.size === 0) return;
    this.dists[0] = this.dists[this.size];
    this.ranks[0] = this.ranks[this.size];
    this.nodes[0] = this.nodes[this.size];
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.size && this.less(left, smallest)) smallest = left;
      if (right < this.size && this.less(right, smallest)) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  get topDist(): number {
    return this.dists[0];
  }
  get topRank(): number {
    return this.ranks[0];
  }
  get topNode(): number {
    return this.nodes[0];
  }
}

export function searchFromSources(graph: StreetGraph, sources: readonly Source[]): SearchResult {
  const { nodeCount, offsets, neighbours, lengths } = graph;
  const dist = new Float64Array(nodeCount).fill(Infinity);
  const rank = new Int32Array(nodeCount).fill(-1);
  const prev = new Int32Array(nodeCount).fill(-1);
  const heap = new Heap(Math.max(16, sources.length * 2));

  for (const s of sources) {
    if (s.cost < dist[s.node] || (s.cost === dist[s.node] && s.rank < rank[s.node])) {
      dist[s.node] = s.cost;
      rank[s.node] = s.rank;
      heap.push(s.cost, s.rank, s.node);
    }
  }

  while (heap.size > 0) {
    const d = heap.topDist;
    const r = heap.topRank;
    const node = heap.topNode;
    heap.pop();
    // A stale entry: the node's label has since improved.
    if (d !== dist[node] || r !== rank[node]) continue;

    for (let j = offsets[node]; j < offsets[node + 1]; j += 1) {
      const next = neighbours[j];
      const nd = d + lengths[j];
      if (nd < dist[next] || (nd === dist[next] && r < rank[next])) {
        dist[next] = nd;
        rank[next] = r;
        prev[next] = node;
        heap.push(nd, r, next);
      }
    }
  }

  return { dist, rank, prev };
}

/** The nodes from `node` to its source, both included; [] when unreached. */
export function pathToSource(result: SearchResult, node: number): number[] {
  if (result.rank[node] < 0) return [];
  const path = [node];
  let current = result.prev[node];
  while (current !== -1) {
    path.push(current);
    current = result.prev[current];
  }
  return path;
}
