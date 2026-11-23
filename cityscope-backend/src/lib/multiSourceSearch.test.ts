import { describe, expect, it } from 'vitest';
import type { StreetGraph } from './streetGraph';
import { pathToSource, searchFromSources } from './multiSourceSearch';

/** Nodes 0-1-2-3-4 in a line (plus, when `island`, an unconnected node 5), every edge exactly 100 m. */
function lineGraph(island = false): StreetGraph {
  const nodeCount = island ? 6 : 5;
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let i = 0; i < 4; i += 1) {
    adjacency[i].push(i + 1);
    adjacency[i + 1].push(i);
  }
  const offsets = new Int32Array(nodeCount + 1);
  const flat: number[] = [];
  adjacency.forEach((list, i) => {
    flat.push(...list);
    offsets[i + 1] = flat.length;
  });
  return {
    nodeCount,
    fileNodeCount: nodeCount,
    lngs: new Float64Array(nodeCount),
    lats: new Float64Array(nodeCount),
    offsets,
    neighbours: Int32Array.from(flat),
    lengths: new Float64Array(flat.length).fill(100),
  };
}

describe('searchFromSources', () => {
  const line = lineGraph();

  it('each node takes its nearest source', () => {
    const r = searchFromSources(line, [{ node: 0, cost: 0, rank: 0 }, { node: 4, cost: 0, rank: 1 }]);
    expect(Array.from(r.rank)).toEqual([0, 0, 0, 1, 1]);
    expect(r.dist[3]).toBeCloseTo(100, 6);
  });

  it('a tie goes to the lower rank whatever the order the sources are given in', () => {
    const r = searchFromSources(line, [{ node: 4, cost: 0, rank: 1 }, { node: 0, cost: 0, rank: 0 }]);
    expect(r.rank[2]).toBe(0);
  });

  it('a join cost of 150 m at node 0 hands node 2 (350 m against 200 m) to the other source, but not node 1 (250 m against 300 m)', () => {
    const r = searchFromSources(line, [{ node: 0, cost: 150, rank: 0 }, { node: 4, cost: 0, rank: 1 }]);
    expect(Array.from(r.rank)).toEqual([0, 0, 1, 1, 1]);
    expect(r.dist[1]).toBeCloseTo(250, 6);
    expect(r.dist[2]).toBeCloseTo(200, 6);
  });

  it('two sources on one node keep the lower cost', () => {
    const r = searchFromSources(line, [{ node: 0, cost: 80, rank: 0 }, { node: 0, cost: 30, rank: 1 }]);
    expect(r.dist[0]).toBeCloseTo(30, 6);
    expect(r.rank[0]).toBe(1);
    expect(r.dist[1]).toBeCloseTo(130, 6);
  });

  it('a node in a part no source reaches is Infinity with rank -1', () => {
    const r = searchFromSources(lineGraph(true), [{ node: 0, cost: 0, rank: 0 }]);
    expect(r.dist[5]).toBe(Infinity);
    expect(r.rank[5]).toBe(-1);
    expect(r.prev[5]).toBe(-1);
    expect(pathToSource(r, 5)).toEqual([]);
  });

  it('pathToSource lists the nodes from the node to its source', () => {
    const r = searchFromSources(line, [{ node: 0, cost: 0, rank: 0 }, { node: 4, cost: 0, rank: 1 }]);
    expect(pathToSource(r, 3)).toEqual([3, 4]);
    expect(pathToSource(r, 4)).toEqual([4]);
    expect(r.prev[4]).toBe(-1);
  });
});
