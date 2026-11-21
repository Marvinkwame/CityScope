import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { NONE_FOUND_METRES } from './needs';
import { PLACES_SOURCE, POPULATION_SOURCE, buildReachPayload, encodePayload, parseWalk, shapeCellCard } from './reachPayload';
import type { CalibrationRow, CardRow, CellRow, NearestRow, ReachInfo } from './reachPayload';

const RING: [number, number][] = [
  [13.4051234, 52.5200678],
  [13.4061234, 52.5200678],
  [13.4061234, 52.5210678],
  [13.4051234, 52.5200678],
];

const CELLS: CellRow[] = [
  { h3: '891f1d48177ffff', residents: 120, ring: RING },
  { h3: '891f1d4817bffff', residents: 80, ring: RING },
];

const NEAREST: NearestRow[] = [
  { h3: '891f1d48177ffff', need: 'sm', metres: 310 },
  { h3: '891f1d48177ffff', need: 'ph', metres: 450 },
  { h3: '891f1d48177ffff', need: 'dr', metres: 520 },
  { h3: '891f1d48177ffff', need: 'sc', metres: 640 },
  { h3: '891f1d48177ffff', need: 'pk', metres: 90 },
  { h3: '891f1d48177ffff', need: 'st', metres: 700 },
  { h3: '891f1d4817bffff', need: 'sm', metres: 1200 },
];

const CAL: CalibrationRow = {
  method: 'estimate',
  metresPerMinute: 72.5,
  kLow: 66,
  kHigh: 79,
  agreement: { 5: 0.91, 10: 0.88, 15: 0.84, 20: 0.79 },
  stops: [5, 10, 15],
  sampleSize: 60,
  checks: { gpCoverage: 0.97 },
  calibratedAt: '2026-10-20T09:10:00.000Z',
};

const INFO: ReachInfo = {
  city: 'berlin',
  cityName: 'Berlin',
  coverage: 'whole city',
  builtAt: '2026-10-20T09:30:00.000Z',
  perHundredThousand: { sm: 41.2, ph: 20.5, dr: 88, sc: 17.3, pk: 36.1, st: 52.9 },
  places: { fetchedAt: '2026-10-19T14:00:00.000Z', osmBase: '2026-10-19T13:58:01Z' },
  parks: { fetchedAt: '2026-10-20', osmBase: null },
  streets: { fetchedAt: null, osmBase: null },
};

describe('buildReachPayload', () => {
  it('rounds coordinates to 5 decimals', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(payload.features[0].geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [13.40512, 52.52007],
          [13.40612, 52.52007],
          [13.40612, 52.52107],
          [13.40512, 52.52007],
        ],
      ],
    });
  });

  it('does not change the rings it is given', () => {
    buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(CELLS[0].ring[0]).toEqual([13.4051234, 52.5200678]);
  });

  it('writes flat integer properties', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    for (const feature of payload.features) {
      expect(feature.type).toBe('Feature');
      expect(Object.keys(feature.properties)).toEqual(['h', 'r', 'sm', 'ph', 'dr', 'sc', 'pk', 'st']);
      for (const [key, value] of Object.entries(feature.properties)) {
        if (key === 'h') {
          expect(typeof value).toBe('string');
        } else {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    }
  });

  it('gives each feature the values of its own cell, in the order of the cells', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(payload.features.map((f) => f.properties.h)).toEqual(['891f1d48177ffff', '891f1d4817bffff']);
    expect(payload.features[0].properties).toEqual({
      h: '891f1d48177ffff',
      r: 120,
      sm: 310,
      ph: 450,
      dr: 520,
      sc: 640,
      pk: 90,
      st: 700,
    });
    expect(payload.features[1].properties.sm).toBe(1200);
  });

  it('writes NONE_FOUND for a need with no nearest row', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    const second = payload.features[1].properties;
    expect(NONE_FOUND_METRES).toBe(65535);
    expect([second.ph, second.dr, second.sc, second.pk, second.st]).toEqual([65535, 65535, 65535, 65535, 65535]);
  });

  it('has a meta.residents that is the sum of r', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(payload.meta.residents).toBe(200);
    expect(payload.meta.residents).toBe(payload.features.reduce((sum, f) => sum + f.properties.r, 0));
  });

  it('has a meta.passes that is false when 15 is not a stop', () => {
    expect(buildReachPayload(CELLS, NEAREST, { ...CAL, stops: [5, 10] }, INFO).meta.passes).toBe(false);
    expect(buildReachPayload(CELLS, NEAREST, { ...CAL, stops: [] }, INFO).meta.passes).toBe(false);
    expect(buildReachPayload(CELLS, NEAREST, { ...CAL, stops: [10, 15] }, INFO).meta.passes).toBe(true);
  });

  it('has a meta.needs that follows NEEDS order with labels, sources and categories', () => {
    const { meta } = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(meta.needs).toEqual([
      { id: 'sm', label: 'Supermarket', source: 'pois', categories: ['supermarket'] },
      { id: 'ph', label: 'Pharmacy', source: 'pois', categories: ['pharmacy'] },
      { id: 'dr', label: 'Doctor', source: 'pois', categories: ['doctors', 'clinic'] },
      { id: 'sc', label: 'School', source: 'pois', categories: ['school'] },
      { id: 'pk', label: 'Park', source: 'parks', categories: [] },
      { id: 'st', label: 'Station', source: 'pois', categories: ['station', 'halt', 'tram_stop', 'subway_entrance'] },
    ]);
  });

  it('says when its places and parks were fetched, and when it was calibrated', () => {
    const { meta } = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(meta.sources).toEqual({
      places: PLACES_SOURCE,
      population: POPULATION_SOURCE,
      placesFetchedAt: '2026-10-19T14:00:00.000Z',
      osmBase: '2026-10-19T13:58:01Z',
      parksFetchedAt: '2026-10-20',
      parksOsmBase: null,
      streetsFetchedAt: null,
      streetsOsmBase: null,
      calibratedAt: '2026-10-20T09:10:00.000Z',
    });
  });

  it('follows the calibration method, with street dates only for a network build', () => {
    const streets = { fetchedAt: '2026-11-20T08:00:00.000Z', osmBase: '2026-11-20T07:58:00Z' };
    const network = buildReachPayload(CELLS, NEAREST, { ...CAL, method: 'network' }, { ...INFO, streets }).meta;
    expect(network.method).toBe('network');
    expect(network.sources.streetsFetchedAt).toBe('2026-11-20T08:00:00.000Z');
    expect(network.sources.streetsOsmBase).toBe('2026-11-20T07:58:00Z');

    const estimate = buildReachPayload(CELLS, NEAREST, CAL, INFO).meta;
    expect(estimate.method).toBe('estimate');
    expect(estimate.sources.streetsFetchedAt).toBeNull();
    expect(estimate.sources.streetsOsmBase).toBeNull();
  });

  it('keeps fetch dates nobody recorded as null', () => {
    const unknown = { fetchedAt: null, osmBase: null };
    const { meta } = buildReachPayload(CELLS, NEAREST, CAL, { ...INFO, places: unknown, parks: unknown });
    expect(meta.sources.placesFetchedAt).toBeNull();
    expect(meta.sources.osmBase).toBeNull();
    expect(meta.sources.parksFetchedAt).toBeNull();
    expect(meta.sources.parksOsmBase).toBeNull();
  });

  it('passes the calibration and the city through into meta', () => {
    const { meta } = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    expect(meta).toEqual({
      city: 'berlin',
      cityName: 'Berlin',
      coverage: 'whole city',
      residents: 200,
      method: 'estimate',
      metresPerMinute: 72.5,
      kLow: 66,
      kHigh: 79,
      agreement: { 5: 0.91, 10: 0.88, 15: 0.84, 20: 0.79 },
      stops: [5, 10, 15],
      passes: true,
      sampleSize: 60,
      needs: meta.needs,
      builtAt: '2026-10-20T09:30:00.000Z',
      sources: meta.sources,
      completeness: {
        perHundredThousand: { sm: 41.2, ph: 20.5, dr: 88, sc: 17.3, pk: 36.1, st: 52.9 },
        checks: { gpCoverage: 0.97 },
      },
    });
  });

  it('names its sources', () => {
    expect(POPULATION_SOURCE).toBe('GHSL GHS-POP R2023A, 2025 epoch (European Commission, JRC), CC BY 4.0');
    expect(PLACES_SOURCE).toBe('© OpenStreetMap contributors, ODbL');
  });

  it('is a FeatureCollection with no features for no cells', () => {
    const payload = buildReachPayload([], [], CAL, INFO);
    expect(payload.type).toBe('FeatureCollection');
    expect(payload.features).toEqual([]);
    expect(payload.meta.residents).toBe(0);
  });
});

describe('encodePayload', () => {
  it('round-trips', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    const { body } = encodePayload(payload);
    expect(JSON.parse(brotliDecompressSync(body).toString('utf8'))).toEqual(payload);
  });

  it('compresses with Brotli at quality 11', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    const { body } = encodePayload(payload);
    const expected = brotliCompressSync(Buffer.from(JSON.stringify(payload), 'utf8'), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    expect(body.equals(expected)).toBe(true);
  });

  it('has an etag that is strong and stable', () => {
    const payload = buildReachPayload(CELLS, NEAREST, CAL, INFO);
    const { body, etag } = encodePayload(payload);
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(etag).toBe(`"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`);
    expect(encodePayload(payload).etag).toBe(etag);

    const changed = buildReachPayload(
      CELLS,
      [...NEAREST.slice(0, -1), { h3: '891f1d4817bffff', need: 'sm', metres: 1201 }],
      CAL,
      INFO,
    );
    expect(encodePayload(changed).etag).not.toBe(etag);
  });
});

describe('shapeCellCard', () => {
  const ROWS: CardRow[] = [
    { need: 'st', metres: 700, name: 'Alexanderplatz', category: 'station', lng: 13.41, lat: 52.52, walk: null },
    { need: 'sm', metres: 612, name: 'Corner Market', category: 'supermarket', lng: 13.4, lat: 52.51, walk: [[13.39, 52.5], [13.4, 52.51]] },
    { need: 'pk', metres: 90, name: null, category: 'park', lng: 13.399, lat: 52.512, walk: null },
  ];

  it('lists the needs in NEEDS order, whatever order the rows came in', () => {
    const card = shapeCellCard('891f1d48947ffff', 120, ROWS, 68);
    expect(card.needs.map((n) => n.need)).toEqual(['sm', 'ph', 'dr', 'sc', 'pk', 'st']);
  });

  it('carries the cell, its residents and k', () => {
    const card = shapeCellCard('891f1d48947ffff', 120, ROWS, 68);
    expect(card.cell).toBe('891f1d48947ffff');
    expect(card.residents).toBe(120);
    expect(card.metresPerMinute).toBe(68);
  });

  it('turns metres into whole minutes at k', () => {
    const sm = shapeCellCard('891f1d48947ffff', 120, ROWS, 68).needs[0];
    expect(sm).toEqual({
      need: 'sm',
      name: 'Corner Market',
      category: 'supermarket',
      lng: 13.4,
      lat: 52.51,
      metres: 612,
      minutes: 9,
      walk: [[13.39, 52.5], [13.4, 52.51]],
    });
  });

  // The map colours a block as within T minutes when metres / k <= T. For a
  // whole-minute limit T, ceil(metres / k) <= T says exactly the same, so the
  // card rounds up: 15.19 minutes must not read as 15 on a block the map
  // shows as outside 15 minutes.
  it('rounds minutes up, so the card never contradicts the map', () => {
    const rows: CardRow[] = [{ need: 'sm', metres: 1010, name: 'Edge Market', category: 'supermarket', lng: 0, lat: 0, walk: null }];
    const sm = shapeCellCard('891f1d48947ffff', 120, rows, 66.5).needs[0];
    expect(1010 / 66.5).toBeGreaterThan(15);
    expect(sm.minutes).toBe(16);
  });

  it('keeps an exact whole minute as it is', () => {
    const rows: CardRow[] = [{ need: 'sm', metres: 0, name: 'Next Door', category: 'supermarket', lng: 0, lat: 0, walk: null }];
    expect(shapeCellCard('891f1d48947ffff', 120, rows, 66.5).needs[0].minutes).toBe(0);
    expect(shapeCellCard('891f1d48947ffff', 120, ROWS, 68).needs[0].minutes).toBe(9);
  });

  it('keeps an unnamed place as a null name', () => {
    const pk = shapeCellCard('891f1d48947ffff', 120, ROWS, 68).needs[4];
    expect(pk.name).toBeNull();
    expect(pk.category).toBe('park');
    expect(pk.minutes).toBe(2);
  });

  it('gives a need with no row all-null values', () => {
    const card = shapeCellCard('891f1d48947ffff', 120, ROWS.filter((r) => r.need !== 'st'), 68);
    expect(card.needs[5]).toEqual({
      need: 'st',
      name: null,
      category: null,
      lng: null,
      lat: null,
      metres: null,
      minutes: null,
      walk: null,
    });
  });

  it('passes each row walk through, and a null walk stays null', () => {
    const card = shapeCellCard('891f1d48947ffff', 120, ROWS, 68);
    expect(card.needs[0].walk).toEqual([[13.39, 52.5], [13.4, 52.51]]);
    expect(card.needs[4].walk).toBeNull();
  });
});

describe('parseWalk', () => {
  it('reads a LineString as [lng, lat] pairs', () => {
    expect(parseWalk('{"type":"LineString","coordinates":[[1,2],[3,4]]}')).toEqual([[1, 2], [3, 4]]);
  });

  it('is null for null, a Point or malformed text', () => {
    expect(parseWalk(null)).toBeNull();
    expect(parseWalk('{"type":"Point","coordinates":[1,2]}')).toBeNull();
    expect(parseWalk('not json')).toBeNull();
    expect(parseWalk('{"type":"LineString","coordinates":[[1,"a"]]}')).toBeNull();
  });
});
