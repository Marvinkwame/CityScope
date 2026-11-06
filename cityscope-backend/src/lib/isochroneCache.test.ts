import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cachePath, cachedResponse, readCachedIsochrone, writeCachedIsochrone } from './isochroneCache';
import type { IsochroneRequest } from './isochroneCache';

const H3 = '891f1d48947ffff';
const REQUEST: IsochroneRequest = { lng: '13.404380', lat: '52.520530', contoursMinutes: [5, 10, 15, 20], generalize: 0 };
const RESPONSE = { type: 'FeatureCollection', features: [{ properties: { contour: 5 } }] };

describe('cachePath', () => {
  it('is <root>/<city>/<h3>.json', () => {
    expect(cachePath('/data/isochrones', 'berlin', H3)).toBe(path.join('/data/isochrones', 'berlin', `${H3}.json`));
  });

  it('refuses a city or cell id that could leave the cache folder', () => {
    expect(() => cachePath('/data/isochrones', '../berlin', H3)).toThrow();
    expect(() => cachePath('/data/isochrones', 'berlin', '../891f1d48947ff')).toThrow();
    expect(() => cachePath('/data/isochrones', 'berlin', '891F1D48947FFFF')).toThrow();
  });
});

describe('cachedResponse', () => {
  const entry = { h3: H3, request: REQUEST, fetchedAt: '2026-10-20T15:00:00.000Z', response: RESPONSE };

  it('gives back the stored response for the same cell and request', () => {
    expect(cachedResponse(entry, H3, REQUEST)).toEqual(RESPONSE);
  });

  it('treats an answer for another origin, other contours, generalisation or cell as a miss', () => {
    expect(cachedResponse(entry, H3, { ...REQUEST, lng: '13.404381' })).toBeNull();
    expect(cachedResponse(entry, H3, { ...REQUEST, lat: '52.520531' })).toBeNull();
    expect(cachedResponse(entry, H3, { ...REQUEST, contoursMinutes: [5, 10, 15] })).toBeNull();
    expect(cachedResponse(entry, H3, { ...REQUEST, contoursMinutes: [10, 5, 15, 20] })).toBeNull();
    expect(cachedResponse(entry, H3, { ...REQUEST, generalize: 1 })).toBeNull();
    expect(cachedResponse(entry, '891f1d4817bffff', REQUEST)).toBeNull();
  });

  it('treats anything that is not a cache entry as a miss', () => {
    expect(cachedResponse(null, H3, REQUEST)).toBeNull();
    expect(cachedResponse([], H3, REQUEST)).toBeNull();
    expect(cachedResponse({ h3: H3, request: REQUEST }, H3, REQUEST)).toBeNull();
    expect(cachedResponse({ h3: H3, response: RESPONSE }, H3, REQUEST)).toBeNull();
  });
});

describe('readCachedIsochrone and writeCachedIsochrone', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'isochrone-cache-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads nothing for a cell never written', () => {
    expect(readCachedIsochrone(root, 'berlin', H3, REQUEST)).toBeNull();
  });

  it('round-trips a response, creating the city folder', () => {
    writeCachedIsochrone(root, 'berlin', H3, REQUEST, RESPONSE, '2026-10-20T15:00:00.000Z');
    expect(readCachedIsochrone(root, 'berlin', H3, REQUEST)).toEqual(RESPONSE);

    const stored: unknown = JSON.parse(readFileSync(cachePath(root, 'berlin', H3), 'utf8'));
    expect(stored).toEqual({ h3: H3, request: REQUEST, fetchedAt: '2026-10-20T15:00:00.000Z', response: RESPONSE });
  });

  it('leaves no temporary file behind', () => {
    writeCachedIsochrone(root, 'berlin', H3, REQUEST, RESPONSE, '2026-10-20T15:00:00.000Z');
    expect(readdirSync(path.join(root, 'berlin'))).toEqual([`${H3}.json`]);
  });

  it('reads a stored answer for a different request as a miss', () => {
    writeCachedIsochrone(root, 'berlin', H3, REQUEST, RESPONSE, '2026-10-20T15:00:00.000Z');
    expect(readCachedIsochrone(root, 'berlin', H3, { ...REQUEST, generalize: 1 })).toBeNull();
  });

  it('reads a file that is not JSON as a miss', () => {
    mkdirSync(path.join(root, 'berlin'), { recursive: true });
    writeFileSync(cachePath(root, 'berlin', H3), '{"h3": "891f1d48947ffff", "requ');
    expect(readCachedIsochrone(root, 'berlin', H3, REQUEST)).toBeNull();
  });
});
