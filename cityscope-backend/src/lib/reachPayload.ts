/**
 * The published form of one city's "Everyday reach" result.
 *
 * Each city is published ahead of time as a single GeoJSON FeatureCollection
 * with a `meta` member, Brotli-compressed and stored with a strong ETag. A
 * feature is one populated H3 cell, carrying its residents and the straight-line
 * metres to its nearest place for each need. The browser turns metres into
 * minutes as `metres / k`, with k taken from `meta`.
 *
 * Feature properties are flat on purpose: Mapbox GL stringifies a nested value
 * in a feature property, so a nested object would arrive as text.
 */

import { createHash } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';
import { cityPasses } from './calibration.js';
import type { Band } from './calibration.js';
import { NEEDS, NONE_FOUND_METRES } from './needs.js';
import type { NeedId } from './needs.js';

export const POPULATION_SOURCE = 'GHSL GHS-POP R2023A, 2025 epoch (European Commission, JRC), CC BY 4.0';
export const PLACES_SOURCE = '© OpenStreetMap contributors, ODbL';

/** Coordinates are written to 5 decimals, about a metre. */
const COORDINATE_DECIMALS = 5;
const COORDINATE_SCALE = 10 ** COORDINATE_DECIMALS;

/** Brotli's best (slowest) setting. A payload is built once and read many times. */
const BROTLI_QUALITY = 11;

/** A populated cell: its H3 index, its residents and its outline. */
export interface CellRow {
  h3: string;
  residents: number;
  /** A closed ring of [lng, lat] pairs, as GeoJSON writes it. */
  ring: [number, number][];
}

/** The straight-line metres from a cell to its nearest place for one need. */
export interface NearestRow {
  h3: string;
  need: NeedId;
  metres: number;
}

/** What the city's calibration says about the walking estimate. */
export interface CalibrationRow {
  /** k, in straight-line metres per walking minute, fitted on every sampled cell. */
  metresPerMinute: number;
  kLow: number;
  kHigh: number;
  /** Held-out agreement with Mapbox in each band, graded at the k fitted on the other half. */
  agreement: Record<Band, number>;
  /** The bands whose agreement reaches the bar. */
  stops: Band[];
  sampleSize: number;
  checks: Record<string, unknown>;
}

/** What the payload says about the city, beyond its cells. */
export interface ReachInfo {
  city: string;
  cityName: string;
  coverage: string;
  /** ISO 8601. */
  builtAt: string;
  /** Places of each need inside the city, per 100,000 residents. */
  perHundredThousand: Record<NeedId, number>;
}

export interface ReachMeta {
  city: string;
  cityName: string;
  coverage: string;
  residents: number;
  method: 'estimate';
  metresPerMinute: number;
  kLow: number;
  kHigh: number;
  agreement: Record<Band, number>;
  stops: Band[];
  passes: boolean;
  sampleSize: number;
  needs: { id: NeedId; label: string }[];
  builtAt: string;
  sources: { places: string; population: string };
  completeness: {
    perHundredThousand: Record<NeedId, number>;
    checks: Record<string, unknown>;
  };
}

/** `h` is the H3 index, `r` the residents, and each need the metres to its nearest place. */
export type ReachProperties = { h: string; r: number } & Record<NeedId, number>;

export interface ReachFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  properties: ReachProperties;
}

export interface ReachPayload {
  type: 'FeatureCollection';
  meta: ReachMeta;
  features: ReachFeature[];
}

function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
}

function nearestByCell(nearest: readonly NearestRow[]): Map<string, Map<NeedId, number>> {
  const byCell = new Map<string, Map<NeedId, number>>();
  for (const row of nearest) {
    const needs = byCell.get(row.h3);
    if (needs) needs.set(row.need, row.metres);
    else byCell.set(row.h3, new Map([[row.need, row.metres]]));
  }
  return byCell;
}

/**
 * Assembles the payload. A need with no nearest row for a cell, meaning the
 * city has no place for it, is written as NONE_FOUND_METRES rather than left
 * out, so every feature has the same flat shape.
 */
export function buildReachPayload(
  cells: readonly CellRow[],
  nearest: readonly NearestRow[],
  cal: CalibrationRow,
  info: ReachInfo,
): ReachPayload {
  const byCell = nearestByCell(nearest);

  let residents = 0;
  const features = cells.map((cell): ReachFeature => {
    residents += cell.residents;
    const found = byCell.get(cell.h3);
    const metres = (need: NeedId): number => found?.get(need) ?? NONE_FOUND_METRES;

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [cell.ring.map(([lng, lat]): [number, number] => [roundCoordinate(lng), roundCoordinate(lat)])],
      },
      properties: {
        h: cell.h3,
        r: cell.residents,
        sm: metres('sm'),
        ph: metres('ph'),
        dr: metres('dr'),
        sc: metres('sc'),
        pk: metres('pk'),
        st: metres('st'),
      },
    };
  });

  return {
    type: 'FeatureCollection',
    meta: {
      city: info.city,
      cityName: info.cityName,
      coverage: info.coverage,
      residents,
      method: 'estimate',
      metresPerMinute: cal.metresPerMinute,
      kLow: cal.kLow,
      kHigh: cal.kHigh,
      agreement: cal.agreement,
      stops: cal.stops,
      passes: cityPasses(cal.stops),
      sampleSize: cal.sampleSize,
      needs: NEEDS.map(({ id, label }) => ({ id, label })),
      builtAt: info.builtAt,
      sources: { places: PLACES_SOURCE, population: POPULATION_SOURCE },
      completeness: { perHundredThousand: info.perHundredThousand, checks: cal.checks },
    },
    features,
  };
}

/**
 * The bytes that are stored and served, and their ETag. The ETag is strong: it
 * is taken from the compressed bytes, so it changes whenever those bytes do.
 */
export function encodePayload(payload: ReachPayload): { body: Buffer; etag: string } {
  const body = brotliCompressSync(Buffer.from(JSON.stringify(payload), 'utf8'), {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  });
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  return { body, etag };
}

/** One need's nearest place for a cell, as the card query reads it. */
export interface CardRow {
  need: NeedId;
  metres: number;
  /** A place may have no name in OpenStreetMap. */
  name: string | null;
  category: string;
  lng: number;
  lat: number;
}

/**
 * What the map shows when a block is picked: its residents, and for each need
 * the nearest place with the walking minutes to it. A need with no place is
 * still listed, with every value null, so the card always has six rows.
 */
export interface CellCard {
  cell: string;
  residents: number;
  metresPerMinute: number;
  needs: {
    need: NeedId;
    name: string | null;
    category: string | null;
    lng: number | null;
    lat: number | null;
    metres: number | null;
    minutes: number | null;
  }[];
}

/**
 * Lays one cell's nearest places out as a card, in NEEDS order whatever order
 * the rows arrive in. Minutes are the same estimate the map uses: straight-line
 * metres divided by k, rounded up to a whole minute. The map counts a place as
 * within a limit of T minutes when metres / k <= T, and for a whole number T
 * that holds exactly when the rounded-up minutes are at most T, so the card
 * never shows 15 minutes for a place the map puts outside 15.
 */
export function shapeCellCard(
  cell: string,
  residents: number,
  rows: readonly CardRow[],
  metresPerMinute: number,
): CellCard {
  const byNeed = new Map<NeedId, CardRow>(rows.map((row) => [row.need, row]));

  return {
    cell,
    residents,
    metresPerMinute,
    needs: NEEDS.map(({ id }) => {
      const row = byNeed.get(id);
      if (!row) {
        return { need: id, name: null, category: null, lng: null, lat: null, metres: null, minutes: null };
      }
      return {
        need: id,
        name: row.name,
        category: row.category,
        lng: row.lng,
        lat: row.lat,
        metres: row.metres,
        minutes: Math.ceil(row.metres / metresPerMinute),
      };
    }),
  };
}
