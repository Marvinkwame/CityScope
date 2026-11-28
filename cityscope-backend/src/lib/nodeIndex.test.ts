import { describe, expect, it } from 'vitest';
import type { StreetsFile } from './streets';
import { buildStreetGraph, haversineMetres } from './streetGraph';
import { NodeIndex } from './nodeIndex';

const M_PER_DEG = 111_195;

function graphOf(points: [number, number][], ways: number[][]) {
  const f: StreetsFile = { version: 2, areas: [], nodeCount: points.length, coords: points.flat(), ways };
  return buildStreetGraph(f);
}

describe('NodeIndex', () => {
  it('returns the nearest node and its distance', () => {
    const g = graphOf([[0, 0], [0, 0.01], [0, 0.02]], [[0, 1, 2]]);
    const r = new NodeIndex(g).nearest(0.0001, 0.0095);
    expect(r.node).toBe(1);
    expect(r.metres).toBeCloseTo(haversineMetres(0.0001, 0.0095, 0, 0.01), 6);
  });

  it('answers with a main-graph node, not a nearer dropped island node', () => {
    // main: nodes 0,1; island: nodes 2,3, one a metre from the query point, which is 40 m from main node 0
    const query = 40 / M_PER_DEG;
    const g = graphOf(
      [[0, 0], [0, 0.01], [0, query + 1 / M_PER_DEG], [0, 0.5]],
      [[0, 1], [2, 3]],
    );
    expect(g.nodeCount).toBe(2);
    const r = new NodeIndex(g).nearest(0, query);
    expect(r.node).toBe(0);
    expect(Math.abs(r.metres - 40)).toBeLessThan(0.5);
  });

  it('still answers for a point 2 km outside every grid cell', () => {
    const g = graphOf([[0, 0], [0, 0.001]], [[0, 1]]);
    const r = new NodeIndex(g).nearest(0, 0.001 + 2000 / M_PER_DEG);
    expect(r.node).toBe(1);
    expect(Math.abs(r.metres - 2000)).toBeLessThan(2);
  });

  it('finds a node several rings away', () => {
    const g = graphOf([[0, 0], [0, 0.1]], [[0, 1]]);
    expect(new NodeIndex(g, 0.001).nearest(0, 0.09).node).toBe(1);
  });
});
