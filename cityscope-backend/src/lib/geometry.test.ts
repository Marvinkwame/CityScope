import { describe, it, expect } from 'vitest';
import { isPolygonGeometry, isAreaGeometry, isContourInputArray } from './geometry';

const validPolygon = {
  type: 'Polygon',
  coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]],
};

const validMultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]]],
};

describe('isPolygonGeometry', () => {
  it('accepts a valid closed polygon', () => {
    expect(isPolygonGeometry(validPolygon)).toBe(true);
  });
  it('rejects a non-Polygon type', () => {
    expect(isPolygonGeometry({ type: 'Point', coordinates: [13.4, 52.5] })).toBe(false);
  });
  it('rejects missing coordinates', () => {
    expect(isPolygonGeometry({ type: 'Polygon' })).toBe(false);
  });
  it('rejects a ring with too few positions', () => {
    expect(isPolygonGeometry({ type: 'Polygon', coordinates: [[[13.3, 52.5], [13.4, 52.5]]] })).toBe(false);
  });
  it('rejects null and non-objects', () => {
    expect(isPolygonGeometry(null)).toBe(false);
    expect(isPolygonGeometry('nope')).toBe(false);
  });
});

describe('isAreaGeometry', () => {
  it('accepts a Polygon', () => {
    expect(isAreaGeometry(validPolygon)).toBe(true);
  });
  it('accepts a MultiPolygon', () => {
    expect(isAreaGeometry(validMultiPolygon)).toBe(true);
  });
  it('rejects a Point', () => {
    expect(isAreaGeometry({ type: 'Point', coordinates: [13.4, 52.5] })).toBe(false);
  });
  it('rejects a MultiPolygon whose inner ring is too short', () => {
    expect(isAreaGeometry({ type: 'MultiPolygon', coordinates: [[[[13.3, 52.5], [13.4, 52.5]]]] })).toBe(false);
  });
});

describe('isContourInputArray', () => {
  const entry = { contour: 5, geometry: validPolygon };

  it('accepts a single valid entry', () => {
    expect(isContourInputArray([entry])).toBe(true);
  });
  it('accepts three valid entries', () => {
    expect(isContourInputArray([entry, { contour: 10, geometry: validPolygon }, { contour: 15, geometry: validMultiPolygon }])).toBe(true);
  });
  it('rejects a non-array', () => {
    expect(isContourInputArray({ contour: 5, geometry: validPolygon })).toBe(false);
  });
  it('rejects an empty array', () => {
    expect(isContourInputArray([])).toBe(false);
  });
  it('rejects more than 6 entries', () => {
    expect(isContourInputArray(Array.from({ length: 7 }, (_, i) => ({ contour: i + 1, geometry: validPolygon })))).toBe(false);
  });
  it('rejects a missing contour', () => {
    expect(isContourInputArray([{ geometry: validPolygon }])).toBe(false);
  });
  it('rejects a non-integer contour', () => {
    expect(isContourInputArray([{ contour: 7.5, geometry: validPolygon }])).toBe(false);
  });
  it('rejects a contour that is a numeric string', () => {
    expect(isContourInputArray([{ contour: '5', geometry: validPolygon }])).toBe(false);
  });
  it('rejects a bad geometry', () => {
    expect(isContourInputArray([{ contour: 5, geometry: { type: 'Point', coordinates: [13.4, 52.5] } }])).toBe(false);
  });
  it('rejects null entries', () => {
    expect(isContourInputArray([null])).toBe(false);
  });
});
