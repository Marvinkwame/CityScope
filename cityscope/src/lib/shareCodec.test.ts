import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, type ShareState } from './shareCodec';

const base: ShareState = {
  v: 1,
  city: 'berlin',
  view: { lng: 13.4, lat: 52.5, zoom: 12.3, bearing: 0, pitch: 0 },
  layers: { roads: true, buildings: false, districts: true, heatmap: false },
  is3D: false,
};

describe('shareCodec', () => {
  it('round-trips a view-only state', () => {
    expect(decodeState(encodeState(base))).toEqual(base);
  });
  it('round-trips a state with an isochrone tool', () => {
    const s: ShareState = { ...base, tool: { kind: 'isochrone', profile: 'walking', contourMinutes: [5, 10, 15], origin: { lng: 13.4, lat: 52.5 } } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('round-trips a state with a drawn polygon', () => {
    const s: ShareState = { ...base, tool: { kind: 'draw', polygon: { type: 'Polygon', coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.6], [13.3, 52.5]]] } } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('returns null for garbage', () => {
    expect(decodeState('!!!not-valid!!!')).toBeNull();
  });
  it('returns null for a wrong version', () => {
    expect(decodeState(btoa('{"v":2}'))).toBeNull();
  });
  it('produces URL-safe output (no + / =)', () => {
    expect(encodeState(base)).not.toMatch(/[+/=]/);
  });
});
