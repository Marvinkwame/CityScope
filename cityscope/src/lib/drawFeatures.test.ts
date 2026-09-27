import { describe, it, expect } from 'vitest';
import { hasCompletePolygon } from './drawFeatures';

const complete: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[13.39, 52.51], [13.42, 52.51], [13.42, 52.53], [13.39, 52.53], [13.39, 52.51]]],
  },
};

/**
 * Exactly what mapbox-gl-draw puts in its store the moment
 * changeMode('draw_polygon') is called, captured from a live session.
 * A naive features.length check counts this as a drawn shape.
 */
const inProgressStub = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [[null]] },
} as unknown as GeoJSON.Feature;

describe('hasCompletePolygon', () => {
  it('is false for no features', () => {
    expect(hasCompletePolygon([])).toBe(false);
  });

  it('is false for the in-progress draw stub', () => {
    expect(hasCompletePolygon([inProgressStub])).toBe(false);
  });

  it('is true for a finished polygon', () => {
    expect(hasCompletePolygon([complete])).toBe(true);
  });

  it('is true when a finished polygon sits alongside the stub', () => {
    expect(hasCompletePolygon([inProgressStub, complete])).toBe(true);
  });

  it('is false for a ring with too few positions', () => {
    const short = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[13.39, 52.51], [13.42, 52.51]]] },
    } as unknown as GeoJSON.Feature;
    expect(hasCompletePolygon([short])).toBe(false);
  });

  it('is false for a partially drawn ring containing nulls', () => {
    const partial = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[13.39, 52.51], null, null, null]] },
    } as unknown as GeoJSON.Feature;
    expect(hasCompletePolygon([partial])).toBe(false);
  });

  it('is false for a non-polygon geometry', () => {
    const pt: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [13.4, 52.5] },
    };
    expect(hasCompletePolygon([pt])).toBe(false);
  });

  it('is false for a feature with no geometry', () => {
    expect(hasCompletePolygon([{ type: 'Feature', properties: {}, geometry: null } as unknown as GeoJSON.Feature])).toBe(false);
  });
});
