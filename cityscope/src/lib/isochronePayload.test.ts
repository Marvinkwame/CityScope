import { describe, it, expect } from 'vitest';
import { toContourPayload } from './isochronePayload';

const polygon: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.55], [13.3, 52.5]]],
};

const feature = (contour: number): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { contour },
  geometry: polygon,
});

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

describe('toContourPayload', () => {
  it('maps features to contour entries', () => {
    expect(toContourPayload(fc([feature(5)]))).toEqual([{ contour: 5, geometry: polygon }]);
  });

  it('sorts ascending by contour', () => {
    const out = toContourPayload(fc([feature(15), feature(5), feature(10)]));
    expect(out.map((e) => e.contour)).toEqual([5, 10, 15]);
  });

  it('drops features that are not polygonal', () => {
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: { contour: 5 },
      geometry: { type: 'Point', coordinates: [13.4, 52.5] },
    };
    expect(toContourPayload(fc([point, feature(10)]))).toEqual([{ contour: 10, geometry: polygon }]);
  });

  it('keeps MultiPolygon features', () => {
    const multi: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [polygon.coordinates] };
    const out = toContourPayload(fc([{ type: 'Feature', properties: { contour: 5 }, geometry: multi }]));
    expect(out).toEqual([{ contour: 5, geometry: multi }]);
  });

  it('returns an empty array for undefined input', () => {
    expect(toContourPayload(undefined)).toEqual([]);
  });

  it('returns an empty array for a collection with no features', () => {
    expect(toContourPayload(fc([]))).toEqual([]);
  });

  it('defaults a missing contour property to 0', () => {
    const noProps: GeoJSON.Feature = { type: 'Feature', properties: null, geometry: polygon };
    expect(toContourPayload(fc([noProps]))).toEqual([{ contour: 0, geometry: polygon }]);
  });
});
