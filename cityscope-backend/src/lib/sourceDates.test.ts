import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fetchRecordJson,
  osmBaseOf,
  parksRecordName,
  parseFetchRecord,
  placesRecordName,
  readFetchRecord,
  writeFetchRecord,
} from './sourceDates';

describe('osmBaseOf', () => {
  it("reads Overpass's osm3s.timestamp_osm_base", () => {
    const body = {
      version: 0.6,
      osm3s: { timestamp_osm_base: '2026-10-20T15:24:03Z', copyright: 'The data included in this document is from www.openstreetmap.org.' },
      elements: [],
    };
    expect(osmBaseOf(body)).toBe('2026-10-20T15:24:03Z');
  });

  it('is null when the answer does not say', () => {
    expect(osmBaseOf({ elements: [] })).toBeNull();
    expect(osmBaseOf({ osm3s: {} })).toBeNull();
    expect(osmBaseOf({ osm3s: { timestamp_osm_base: 1760973843 } })).toBeNull();
    expect(osmBaseOf({ osm3s: { timestamp_osm_base: '' } })).toBeNull();
    expect(osmBaseOf(null)).toBeNull();
    expect(osmBaseOf('2026-10-20T15:24:03Z')).toBeNull();
  });
});

describe('fetchRecordJson', () => {
  it('writes the fetch time and the OSM base, ending in a newline', () => {
    expect(fetchRecordJson('2026-10-21T08:00:00.000Z', '2026-10-21T07:58:00Z')).toBe(
      '{\n  "fetchedAt": "2026-10-21T08:00:00.000Z",\n  "osmBase": "2026-10-21T07:58:00Z"\n}\n',
    );
  });

  it('keeps an unknown OSM base as null', () => {
    expect(JSON.parse(fetchRecordJson('2026-10-20', null))).toEqual({ fetchedAt: '2026-10-20', osmBase: null });
  });
});

describe('record file names', () => {
  it('sit beside the files they describe', () => {
    expect(placesRecordName('new-york')).toBe('pois-data-new-york.source.json');
    expect(parksRecordName('new-york')).toBe('parks-new-york.source.json');
  });
});

describe('readFetchRecord and writeFetchRecord', () => {
  it('round-trips, and reads a missing file as nulls', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fetch-record-'));
    try {
      const file = path.join(dir, placesRecordName('berlin'));
      expect(readFetchRecord(file)).toEqual({ fetchedAt: null, osmBase: null });
      writeFetchRecord(file, '2026-10-21T08:00:00.000Z', '2026-10-21T07:58:00Z');
      expect(readFetchRecord(file)).toEqual({ fetchedAt: '2026-10-21T08:00:00.000Z', osmBase: '2026-10-21T07:58:00Z' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseFetchRecord', () => {
  it('reads what fetchRecordJson writes', () => {
    expect(parseFetchRecord(fetchRecordJson('2026-10-21T08:00:00.000Z', '2026-10-21T07:58:00Z'))).toEqual({
      fetchedAt: '2026-10-21T08:00:00.000Z',
      osmBase: '2026-10-21T07:58:00Z',
    });
    expect(parseFetchRecord('{"fetchedAt": "2026-10-20", "osmBase": null}')).toEqual({
      fetchedAt: '2026-10-20',
      osmBase: null,
    });
  });

  it('gives nulls for a missing record, rather than a guess', () => {
    expect(parseFetchRecord(null)).toEqual({ fetchedAt: null, osmBase: null });
  });

  it('gives nulls for a record it cannot read', () => {
    expect(parseFetchRecord('not json')).toEqual({ fetchedAt: null, osmBase: null });
    expect(parseFetchRecord('[]')).toEqual({ fetchedAt: null, osmBase: null });
    expect(parseFetchRecord('{"fetchedAt": 20261020, "osmBase": false}')).toEqual({ fetchedAt: null, osmBase: null });
  });
});
