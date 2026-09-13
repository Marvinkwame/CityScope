import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, type ShareState } from './shareCodec';

const base: ShareState = {
  v: 1,
  city: 'berlin',
  view: { lng: 13.4, lat: 52.5, zoom: 12.3, bearing: 0, pitch: 0 },
  layers: { roads: true, buildings: false, districts: true, heatmap: false },
  is3D: false,
};

const polygon = {
  type: 'Polygon' as const,
  coordinates: [[[13.3, 52.5], [13.4, 52.5], [13.4, 52.6], [13.3, 52.5]]],
};

/** Encode an arbitrary object the way the codec does, bypassing type checks. */
function raw(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('shareCodec', () => {
  it('round-trips a view-only state', () => {
    expect(decodeState(encodeState(base))).toEqual(base);
  });
  it('round-trips a state with an isochrone tool', () => {
    const s: ShareState = { ...base, tool: { kind: 'isochrone', profile: 'walking', contourMinutes: [5, 10, 15], origin: { lng: 13.4, lat: 52.5 } } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('round-trips a state with a route tool', () => {
    const s: ShareState = { ...base, tool: { kind: 'route', profile: 'cycling', origin: { lng: 13.4, lat: 52.5 }, destination: { lng: 13.5, lat: 52.6 } } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('round-trips a state with a drawn polygon', () => {
    const s: ShareState = { ...base, tool: { kind: 'draw', polygon } };
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

// An incomplete tool used to survive validation, leaving `undefined` in the
// stores. Every `enabled` guard downstream tests `!== null`, which `undefined`
// passes — so the query fired and threw. A malformed tool is dropped; the
// shared view itself is still honoured.
describe('decodeState tool validation', () => {
  const withTool = (tool: unknown) => raw({ ...base, tool });

  it('drops an isochrone tool with no origin', () => {
    expect(decodeState(withTool({ kind: 'isochrone', profile: 'walking', contourMinutes: [5] }))).toEqual(base);
  });
  it('drops an isochrone tool whose origin is not numeric', () => {
    expect(decodeState(withTool({ kind: 'isochrone', profile: 'walking', contourMinutes: [5], origin: { lng: 'x', lat: 52.5 } }))).toEqual(base);
  });
  it('drops an isochrone tool with an unknown profile', () => {
    expect(decodeState(withTool({ kind: 'isochrone', profile: 'teleport', contourMinutes: [5], origin: { lng: 13.4, lat: 52.5 } }))).toEqual(base);
  });
  it('drops an isochrone tool with empty contourMinutes', () => {
    expect(decodeState(withTool({ kind: 'isochrone', profile: 'walking', contourMinutes: [], origin: { lng: 13.4, lat: 52.5 } }))).toEqual(base);
  });
  it('drops an isochrone tool with non-numeric contourMinutes', () => {
    expect(decodeState(withTool({ kind: 'isochrone', profile: 'walking', contourMinutes: ['5'], origin: { lng: 13.4, lat: 52.5 } }))).toEqual(base);
  });
  it('drops a route tool with no destination', () => {
    expect(decodeState(withTool({ kind: 'route', profile: 'walking', origin: { lng: 13.4, lat: 52.5 } }))).toEqual(base);
  });
  it('drops a draw tool with no polygon', () => {
    expect(decodeState(withTool({ kind: 'draw' }))).toEqual(base);
  });
  it('drops a draw tool whose ring is too short', () => {
    expect(decodeState(withTool({ kind: 'draw', polygon: { type: 'Polygon', coordinates: [[[13.3, 52.5], [13.4, 52.5]]] } }))).toEqual(base);
  });
  it('drops a draw tool whose geometry is not a Polygon', () => {
    expect(decodeState(withTool({ kind: 'draw', polygon: { type: 'Point', coordinates: [13.4, 52.5] } }))).toEqual(base);
  });
  it('drops an unknown tool kind', () => {
    expect(decodeState(withTool({ kind: 'elevation', foo: 1 }))).toEqual(base);
  });
  it('keeps a valid tool alongside the view', () => {
    const decoded = decodeState(withTool({ kind: 'draw', polygon }));
    expect(decoded?.tool).toEqual({ kind: 'draw', polygon });
  });
});

describe('decodeState output narrowing', () => {
  it('ignores unknown top-level keys rather than passing them through', () => {
    const decoded = decodeState(raw({ ...base, evil: 'payload' }));
    expect(decoded).toEqual(base);
    expect(decoded && 'evil' in decoded).toBe(false);
  });
  it('ignores unknown keys inside layers', () => {
    const decoded = decodeState(raw({ ...base, layers: { ...base.layers, sneaky: true } }));
    expect(decoded?.layers).toEqual(base.layers);
  });
  it('ignores unknown keys inside view', () => {
    const decoded = decodeState(raw({ ...base, view: { ...base.view, extra: 9 } }));
    expect(decoded?.view).toEqual(base.view);
  });
});
