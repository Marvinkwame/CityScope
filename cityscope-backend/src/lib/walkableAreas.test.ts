import { describe, expect, it } from 'vitest';
import type { StreetsFile } from './streets.js';
import { buildStreetGraph, haversineMetres } from './streetGraph.js';
import { searchFromSources } from './multiSourceSearch.js';
import { MAX_AREA_OUTLINE_NODES, areaCrossings, withCrossings } from './walkableAreas.js';

function file(points: [number, number][], ways: number[][], areas: number[] = [0]): StreetsFile {
  return { version: 2, nodeCount: points.length, coords: points.flat(), ways, areas };
}

// square 0(0,0) 1(0.001,0) 2(0.001,0.001) 3(0,0.001); street 4(-0.001,0)-0
const square: StreetsFile = {
  version: 2,
  nodeCount: 5,
  coords: [0, 0, 0.001, 0, 0.001, 0.001, 0, 0.001, -0.001, 0],
  ways: [[0, 1, 2, 3, 0], [4, 0]],
  areas: [0],
};

// the square plus a street 5(0.002,0.001)-2, so 0 and 2 are both entrances
const squareTwoEntrances: StreetsFile = {
  version: 2,
  nodeCount: 6,
  coords: [...square.coords, 0.002, 0.001],
  ways: [[0, 1, 2, 3, 0], [4, 0], [5, 2]],
  areas: [0],
};

// L: 0(0,0) 1(0.002,0) 2(0.002,0.001) 3(0.001,0.001) 4(0.001,0.002) 5(0,0.002); street 6(0.003,0.001)-2
const lShape = file(
  [[0, 0], [0.002, 0], [0.002, 0.001], [0.001, 0.001], [0.001, 0.002], [0, 0.002], [0.003, 0.001]],
  [[0, 1, 2, 3, 4, 5, 0], [6, 2]],
);

// figure 8: two triangles sharing node 0; street 5 on node 2
const figureEight = file(
  [[0, 0], [0.001, 0.001], [0.002, 0], [-0.001, 0.001], [-0.002, 0], [0.002, 0.002]],
  [[0, 1, 2, 0, 3, 4, 0], [5, 2]],
);

// four collinear nodes closed on y = 0, with a street touching node 0
const collinear = file(
  [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [-0.001, 0]],
  [[0, 1, 2, 3, 0], [4, 0]],
);

function bigPolygon(n: number): StreetsFile {
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    points.push([0.01 * Math.cos(a), 0.01 * Math.sin(a)]);
  }
  points.push([0.02, 0]);
  const outline = Array.from({ length: n }, (_, i) => i);
  return file(points, [[...outline, 0], [n, 0]]);
}

describe('areaCrossings', () => {
  it('crosses a square from an entrance to the corner it can see', () => {
    expect(areaCrossings(square)).toEqual({ pairs: [[0, 2]], areas: 1, skipped: 0 });
  });

  it('keeps a crossing inside a concave outline, using the midpoint rule', () => {
    // 2->0 stays inside; 2->4 runs outside the notch; 2->5 crosses edge 3-4
    expect(areaCrossings(lShape).pairs).toEqual([[0, 2]]);
  });

  it('lists a crossing between two entrances once', () => {
    expect(areaCrossings(squareTwoEntrances).pairs).toEqual([[0, 2]]);
  });

  it('skips an area with more than 1,000 outline nodes', () => {
    expect(areaCrossings(bigPolygon(MAX_AREA_OUTLINE_NODES + 1))).toEqual({ pairs: [], areas: 1, skipped: 1 });
  });

  it('crosses an area of exactly 1,000 outline nodes', () => {
    const result = areaCrossings(bigPolygon(MAX_AREA_OUTLINE_NODES));
    expect(result.skipped).toBe(0);
    expect(result.pairs.length).toBeGreaterThan(0);
  });

  it('adds nothing for a closed way that is not listed as an area', () => {
    expect(areaCrossings({ ...square, areas: [] }).pairs).toEqual([]);
  });

  it('returns an empty result for a file with ways but no areas', () => {
    expect(areaCrossings({ ...squareTwoEntrances, areas: [] })).toEqual({ pairs: [], areas: 0, skipped: 0 });
  });

  it('finds no entrance on an area no other way touches', () => {
    expect(areaCrossings({ ...square, ways: [[0, 1, 2, 3, 0]] }).pairs).toEqual([]);
  });

  it('never pairs a node with itself on a self-touching outline', () => {
    expect(areaCrossings(figureEight).pairs.every(([a, b]) => a !== b)).toBe(true);
  });

  it('adds nothing for an outline with no area', () => {
    expect(areaCrossings(collinear).pairs).toEqual([]);
  });

  it('returns pairs as [lower, higher], sorted and unique', () => {
    const { pairs } = areaCrossings(squareTwoEntrances);
    for (const [a, b] of pairs) expect(a).toBeLessThan(b);
  });
});

describe('withCrossings', () => {
  it('shortens the walk across the square to the straight diagonal', () => {
    const graph = buildStreetGraph(withCrossings(square, areaCrossings(square).pairs));
    const { dist } = searchFromSources(graph, [{ node: 0, cost: 0, rank: 0 }]);
    expect(dist[2]).toBeCloseTo(haversineMetres(0, 0, 0.001, 0.001), 6);
  });

  it('appends each pair as a two-node way and leaves areas unchanged', () => {
    const out = withCrossings(square, [[0, 2]]);
    expect(out.ways).toEqual([...square.ways, [0, 2]]);
    expect(out.areas).toEqual(square.areas);
    expect(square.ways).toHaveLength(2);
  });

  it('builds the same graph as before when there are no crossings', () => {
    expect(buildStreetGraph(withCrossings({ ...square, areas: [] }, []))).toEqual(
      buildStreetGraph({ ...square, areas: [] }),
    );
  });
});
