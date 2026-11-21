import { describe, expect, it } from 'vitest';
import { simplifyWalk } from './walks';

describe('simplifyWalk', () => {
  it('reduces collinear points to their ends', () => {
    const line: [number, number][] = [0, 0.0002, 0.0004, 0.0006, 0.0008].map((x) => [x, 0.001]);
    expect(simplifyWalk(line)).toEqual([
      [0, 0.001],
      [0.0008, 0.001],
    ]);
  });

  it('keeps a corner 5 m off the line', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.0005, 0.000045],
      [0.001, 0],
    ];
    expect(simplifyWalk(pts)).toHaveLength(3);
  });

  it('drops a point within the tolerance', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.0005, 0.00001],
      [0.001, 0],
    ];
    expect(simplifyWalk(pts)).toHaveLength(2);
  });

  it('rounds coordinates to 5 decimals', () => {
    expect(
      simplifyWalk([
        [13.4049999, 52.5200001],
        [13.4150004, 52.5300006],
      ]),
    ).toEqual([
      [13.405, 52.52],
      [13.415, 52.53],
    ]);
  });

  it('drops consecutive duplicates', () => {
    expect(
      simplifyWalk([
        [1, 1],
        [1, 1],
        [1, 1],
        [1.001, 1.001],
        [1.001, 1.001],
      ]),
    ).toEqual([
      [1, 1],
      [1.001, 1.001],
    ]);
  });

  it('gives two points for two identical points', () => {
    expect(
      simplifyWalk([
        [1, 1],
        [1, 1],
      ]),
    ).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });
});
