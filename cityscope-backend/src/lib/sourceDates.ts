/**
 * When the place and park data were fetched, kept beside each data file.
 *
 * A fetch writes a small record next to the file it wrote:
 * `src/scripts/pois-data-<city>.source.json` for places (committed, like the
 * places file) and `data/parks-<city>.source.json` for parks (git-ignored, like
 * the parks file). Each holds `fetchedAt`, when the fetch ran, and `osmBase`,
 * the OpenStreetMap database state the Overpass server answered from. A
 * publish reads them into the payload's `meta.sources`. A missing or unreadable
 * record reads as nulls, so a payload never states a date nobody recorded.
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** What a fetch record holds. */
export interface FetchRecord {
  /** ISO 8601: a timestamp, or only a date when only the day is known. */
  fetchedAt: string | null;
  /** ISO 8601: Overpass's `osm3s.timestamp_osm_base`, or null when unknown. */
  osmBase: string | null;
}

/** The OSM database time an Overpass answer was taken from, or null when it does not say. */
export function osmBaseOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const osm3s = (body as { osm3s?: unknown }).osm3s;
  if (typeof osm3s !== 'object' || osm3s === null) return null;
  const base = (osm3s as { timestamp_osm_base?: unknown }).timestamp_osm_base;
  return typeof base === 'string' && base.length > 0 ? base : null;
}

/** The text of a record file. */
export function fetchRecordJson(fetchedAt: string, osmBase: string | null): string {
  const record: FetchRecord = { fetchedAt, osmBase };
  return `${JSON.stringify(record, null, 2)}\n`;
}

const UNKNOWN: FetchRecord = { fetchedAt: null, osmBase: null };

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The record beside `pois-data-<city>.json`, in src/scripts/. */
export function placesRecordName(cityId: string): string {
  return `pois-data-${cityId}.source.json`;
}

/** The record beside `parks-<city>.json`, in data/. */
export function parksRecordName(cityId: string): string {
  return `parks-${cityId}.source.json`;
}

/** Writes a record file. */
export function writeFetchRecord(filePath: string, fetchedAt: string, osmBase: string | null): void {
  writeFileSync(filePath, fetchRecordJson(fetchedAt, osmBase));
}

/** Reads a record file; a missing or unreadable one gives nulls. */
export function readFetchRecord(filePath: string): FetchRecord {
  let text: string | null;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    text = null;
  }
  return parseFetchRecord(text);
}

/** Reads a record file's text; `null` (no file) and anything unreadable give nulls. */
export function parseFetchRecord(text: string | null): FetchRecord {
  if (text === null) return { ...UNKNOWN };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...UNKNOWN };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...UNKNOWN };
  const record = parsed as Partial<Record<keyof FetchRecord, unknown>>;
  return { fetchedAt: stringOrNull(record.fetchedAt), osmBase: stringOrNull(record.osmBase) };
}
