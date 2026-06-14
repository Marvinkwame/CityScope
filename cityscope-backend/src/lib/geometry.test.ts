import { describe, it, expect } from 'vitest';
import { isPolygonGeometry } from './geometry';

const validPolygon = {
  type: 'Polygon',
  coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]],
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
