import { describe, it, expect } from 'vitest';
import { groupPoisByBand, type BandRow } from './isochroneBands';

const row = (contour: number, id: number, category: string): BandRow => ({
  contour,
  id,
  name: `POI ${id}`,
  category,
  lat: 52.5,
  lng: 13.4,
});

describe('groupPoisByBand', () => {
  it('groups rows by contour, ascending', () => {
    const bands = groupPoisByBand([row(10, 2, 'cafe'), row(5, 1, 'cafe')], [5, 10]);
    expect(bands.map((b) => b.contour)).toEqual([5, 10]);
  });

  it('counts POIs per band', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe'), row(5, 2, 'bar')], [5]);
    expect(bands[0].poiCount).toBe(2);
    expect(bands[0].pois).toHaveLength(2);
  });

  it('tallies categories per band', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe'), row(5, 2, 'cafe'), row(5, 3, 'bar')], [5]);
    expect(bands[0].categoryCounts).toEqual({ cafe: 2, bar: 1 });
  });

  it('keeps cumulative duplication across bands', () => {
    // The same POI inside both the 5- and 10-minute polygons appears in both.
    const bands = groupPoisByBand([row(5, 1, 'cafe'), row(10, 1, 'cafe')], [5, 10]);
    expect(bands[0].poiCount).toBe(1);
    expect(bands[1].poiCount).toBe(1);
  });

  it('returns a requested contour with no rows as an empty band', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe')], [5, 10, 15]);
    expect(bands).toHaveLength(3);
    expect(bands[2]).toEqual({ contour: 15, poiCount: 0, categoryCounts: {}, pois: [] });
  });

  it('returns an empty band per contour when there are no rows at all', () => {
    expect(groupPoisByBand([], [5, 10])).toEqual([
      { contour: 5, poiCount: 0, categoryCounts: {}, pois: [] },
      { contour: 10, poiCount: 0, categoryCounts: {}, pois: [] },
    ]);
  });

  it('includes a row whose contour was not requested', () => {
    const bands = groupPoisByBand([row(20, 1, 'cafe')], [5]);
    expect(bands.map((b) => b.contour)).toEqual([5, 20]);
  });

  it('strips the contour field from returned POIs', () => {
    const bands = groupPoisByBand([row(5, 1, 'cafe')], [5]);
    expect(bands[0].pois[0]).toEqual({ id: 1, name: 'POI 1', category: 'cafe', lat: 52.5, lng: 13.4 });
  });

  it('preserves a null POI name', () => {
    const bands = groupPoisByBand([{ ...row(5, 1, 'cafe'), name: null }], [5]);
    expect(bands[0].pois[0].name).toBeNull();
  });
});
