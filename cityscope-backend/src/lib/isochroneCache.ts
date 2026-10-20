/**
 * A disk cache of the Mapbox walking isochrones that calibration asks for.
 *
 * Calibration samples the same 60 cells of a city every time (fixed seed), so a
 * rerun asks Mapbox the same 60 questions. Keeping each answer on disk, one
 * file per cell at `<root>/<city>/<h3>.json`, makes a rerun cost no requests,
 * and lets a calibration be repeated on another database (production, after
 * the local run) with the same ground truth, provided the cells are the same.
 *
 * A file records the request it answers (origin, contours and generalisation,
 * never the token). An answer is reused only for exactly that request, so a
 * change to the request asks Mapbox again rather than reusing a stale answer.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isH3CellId } from './reachHttp.js';

/** What was asked of Mapbox for one cell. Coordinates are the exact strings sent. */
export interface IsochroneRequest {
  lng: string;
  lat: string;
  contoursMinutes: readonly number[];
  generalize: number;
}

/** One cached answer, as stored on disk. */
export interface CachedIsochrone {
  h3: string;
  request: IsochroneRequest;
  /** ISO 8601: when Mapbox answered. */
  fetchedAt: string;
  /** Mapbox's response body, as it arrived. */
  response: unknown;
}

const CITY_ID = /^[a-z0-9-]+$/;

/** Where one cell's answer is kept. Ids are checked, so a path can never leave the root. */
export function cachePath(root: string, cityId: string, h3: string): string {
  if (!CITY_ID.test(cityId)) throw new Error(`Not a city id: ${cityId}`);
  if (!isH3CellId(h3)) throw new Error(`Not a cell id: ${h3}`);
  return path.join(root, cityId, `${h3}.json`);
}

function sameRequest(stored: unknown, wanted: IsochroneRequest): boolean {
  if (typeof stored !== 'object' || stored === null) return false;
  const s = stored as Partial<Record<keyof IsochroneRequest, unknown>>;
  return (
    s.lng === wanted.lng &&
    s.lat === wanted.lat &&
    s.generalize === wanted.generalize &&
    Array.isArray(s.contoursMinutes) &&
    s.contoursMinutes.length === wanted.contoursMinutes.length &&
    s.contoursMinutes.every((minutes, i) => minutes === wanted.contoursMinutes[i])
  );
}

/**
 * The response a parsed cache entry holds, when it answers this cell and
 * exactly this request; otherwise null, a miss.
 */
export function cachedResponse(entry: unknown, h3: string, request: IsochroneRequest): unknown {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
  const e = entry as Partial<Record<keyof CachedIsochrone, unknown>>;
  if (e.h3 !== h3 || !sameRequest(e.request, request) || !('response' in e)) return null;
  return e.response ?? null;
}

/** The cached response for a cell, or null when there is none for this request (or the file is unreadable). */
export function readCachedIsochrone(root: string, cityId: string, h3: string, request: IsochroneRequest): unknown {
  let text: string;
  try {
    text = readFileSync(cachePath(root, cityId, h3), 'utf8');
  } catch {
    return null;
  }
  try {
    return cachedResponse(JSON.parse(text), h3, request);
  } catch {
    return null;
  }
}

/**
 * Stores one answer. It is written to a temporary file and renamed into place,
 * so an interrupted run never leaves half a file that a later run would read.
 */
export function writeCachedIsochrone(
  root: string,
  cityId: string,
  h3: string,
  request: IsochroneRequest,
  response: unknown,
  fetchedAt: string,
): void {
  const target = cachePath(root, cityId, h3);
  mkdirSync(path.dirname(target), { recursive: true });
  const entry: CachedIsochrone = { h3, request, fetchedAt, response };
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(entry));
  renameSync(temporary, target);
}
