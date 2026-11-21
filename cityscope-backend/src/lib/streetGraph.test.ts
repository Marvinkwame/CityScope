import { describe, expect, it } from 'vitest';
import type { StreetsFile } from './streets';
import { buildStreetGraph, haversineMetres } from './streetGraph';

function file(points: [number, number][], ways: number[][]): StreetsFile {
  return { version: 1, nodeCount: points.length, coords: points.flat(), ways };
}

function neighboursOf(g: ReturnType<typeof buildStreetGraph>, node: number): number[] {
  return Array.from(g.neighbours.subarray(g.offsets[node], g.offsets[node + 1]));
}

describe('haversineMetres', () => {
  it('is about 111,195 m for one degree of latitude', () => {
    expect(Math.abs(haversineMetres(0, 0, 0, 1) - 111_195)).toBeLessThan(1);
  });
});

describe('buildStreetGraph', () => {
  it('joins two ways that share a node and stores each edge both ways', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0, 0.001],
      [0.001, 0.001],
    ];
    const g = buildStreetGraph(file(pts, [[0, 1], [1, 2]]));
    expect(g.nodeCount).toBe(3);
    expect(g.fileNodeCount).toBe(3);
    expect(g.offsets.length).toBe(4);
    expect(neighboursOf(g, 1).sort()).toEqual([0, 2]);
    expect(neighboursOf(g, 0)).toEqual([1]);
    const len01 = haversineMetres(0, 0, 0, 0.001);
    const e = g.offsets[0];
    expect(g.lengths[e]).toBeCloseTo(len01, 6);
    const back = g.offsets[1] + neighboursOf(g, 1).indexOf(0);
    expect(g.lengths[back]).toBeCloseTo(len01, 6);
  });

  it('adds no zero-length edge for a repeated consecutive node', () => {
    const g = buildStreetGraph(file([[0, 0], [0, 0.001]], [[0, 0, 1]]));
    expect(neighboursOf(g, 0)).toEqual([1]);
    expect(neighboursOf(g, 1)).toEqual([0]);
  });

  it('drops an island and counts it only in fileNodeCount', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0, 0.001],
      [0, 0.002],
      [1, 1],
      [1, 1.001],
    ];
    const g = buildStreetGraph(file(pts, [[0, 1, 2], [3, 4]]));
    expect(g.nodeCount).toBe(3);
    expect(g.fileNodeCount).toBe(5);
    expect(Array.from(g.lngs)).toEqual([0, 0, 0]);
    expect(g.lats[2]).toBeCloseTo(0.002, 9);
  });

  it('keeps the part with the lowest file index on a tie', () => {
    const g = buildStreetGraph(file([[5, 5], [5, 5.001], [0, 0], [0, 0.001]], [[2, 3], [0, 1]]));
    expect(g.nodeCount).toBe(2);
    expect(g.lngs[0]).toBe(5);
  });

  it('handles an empty file', () => {
    const g = buildStreetGraph(file([], []));
    expect(g.nodeCount).toBe(0);
    expect(g.offsets.length).toBe(1);
  });
});
