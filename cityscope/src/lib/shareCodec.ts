import type { TravelProfile } from '../store/isochroneStore';
import type { PolygonGeometry } from '../store/drawStore';
import { canonicalNeeds, isNeedId, isReachMinutes } from './reach/model';
import type { NeedId, ReachMinutes } from './reach/model';

/** The URL hash prefix that marks a share link. */
export const SHARE_HASH_PREFIX = '#s=';

export type LngLat = { lng: number; lat: number };

export type ShareTool =
  | { kind: 'isochrone'; profile: TravelProfile; contourMinutes: number[]; origin: LngLat }
  | { kind: 'route'; profile: TravelProfile; origin: LngLat; destination: LngLat }
  | { kind: 'draw'; polygon: PolygonGeometry };

/** Everyday reach: time limit, chosen needs, and the selected block if any. */
export interface ShareReach {
  t: ReachMinutes;
  n: NeedId[];
  c?: string;
}

export interface ShareState {
  v: 1;
  city: string;
  view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number };
  layers: { roads: boolean; buildings: boolean; districts: boolean; heatmap: boolean };
  is3D: boolean;
  tool?: ShareTool;
  reach?: ShareReach;
}

/** A tool or the heatmap owns the map, so a link carrying both shows them, not reach. */
export function effectiveReach(state: ShareState): ShareReach | undefined {
  return state.tool || state.layers.heatmap ? undefined : state.reach;
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeState(state: ShareState): string {
  return toBase64Url(JSON.stringify(state));
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const PROFILES: readonly string[] = ['walking', 'cycling', 'driving'];

function isProfile(v: unknown): v is TravelProfile {
  return typeof v === 'string' && PROFILES.includes(v);
}

function isLngLat(v: unknown): v is LngLat {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as { lng?: unknown; lat?: unknown };
  return isNum(p.lng) && isNum(p.lat);
}

function isPolygon(v: unknown): v is PolygonGeometry {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt: unknown) => Array.isArray(pt) && pt.length >= 2 && isNum(pt[0]) && isNum(pt[1]),
  );
}

/**
 * Validates a tool's own fields, not just its `kind`.
 *
 * This matters more than it looks: every downstream `enabled` guard is written
 * as `x !== null`, which `undefined` satisfies. A tool that passed a kind-only
 * check could therefore put `undefined` into a store, fire a query, and throw.
 * An invalid tool is dropped rather than nulling the whole state, so a shared
 * view still restores.
 */
function parseTool(v: unknown): ShareTool | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const t = v as Record<string, unknown>;

  if (t.kind === 'isochrone') {
    if (!isProfile(t.profile) || !isLngLat(t.origin)) return undefined;
    if (!Array.isArray(t.contourMinutes) || t.contourMinutes.length === 0) return undefined;
    if (!t.contourMinutes.every(isNum)) return undefined;
    return {
      kind: 'isochrone',
      profile: t.profile,
      contourMinutes: [...t.contourMinutes],
      origin: { lng: t.origin.lng, lat: t.origin.lat },
    };
  }

  if (t.kind === 'route') {
    if (!isProfile(t.profile) || !isLngLat(t.origin) || !isLngLat(t.destination)) return undefined;
    return {
      kind: 'route',
      profile: t.profile,
      origin: { lng: t.origin.lng, lat: t.origin.lat },
      destination: { lng: t.destination.lng, lat: t.destination.lat },
    };
  }

  if (t.kind === 'draw') {
    if (!isPolygon(t.polygon)) return undefined;
    return { kind: 'draw', polygon: t.polygon };
  }

  return undefined;
}

/** Same test as the backend's isH3CellId: a resolution-9 H3 cell. */
const H3_CELL = /^89[0-9a-f]{13}$/;

/** Validates the reach entry; an invalid one is dropped, and only a bad `c` is dropped alone. */
function parseReach(v: unknown): ShareReach | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const r = v as Record<string, unknown>;
  if (!isReachMinutes(r.t)) return undefined;
  if (!Array.isArray(r.n) || r.n.length === 0 || !r.n.every(isNeedId)) return undefined;
  const c = typeof r.c === 'string' && H3_CELL.test(r.c) ? r.c : undefined;
  return { t: r.t, n: canonicalNeeds(r.n), ...(c ? { c } : {}) };
}

/**
 * Decodes a share hash, returning null for anything malformed so a bad link
 * can never crash the app. The result is rebuilt field by field rather than
 * spread from the parsed object, so unrecognised keys never reach the stores.
 */
export function decodeState(raw: string): ShareState | null {
  try {
    const obj = JSON.parse(fromBase64Url(raw)) as Record<string, unknown>;
    if (obj.v !== 1 || typeof obj.city !== 'string') return null;

    const view = obj.view as Record<string, unknown> | undefined;
    if (!view || !isNum(view.lng) || !isNum(view.lat) || !isNum(view.zoom) || !isNum(view.bearing) || !isNum(view.pitch)) {
      return null;
    }

    const layers = obj.layers as Record<string, unknown> | undefined;
    if (!layers || ['roads', 'buildings', 'districts', 'heatmap'].some((k) => typeof layers[k] !== 'boolean')) {
      return null;
    }

    if (typeof obj.is3D !== 'boolean') return null;

    const tool = parseTool(obj.tool);
    const reach = parseReach(obj.reach);

    return {
      v: 1,
      city: obj.city,
      view: {
        lng: view.lng,
        lat: view.lat,
        zoom: view.zoom,
        bearing: view.bearing,
        pitch: view.pitch,
      },
      layers: {
        roads: layers.roads as boolean,
        buildings: layers.buildings as boolean,
        districts: layers.districts as boolean,
        heatmap: layers.heatmap as boolean,
      },
      is3D: obj.is3D,
      ...(tool ? { tool } : {}),
      ...(reach ? { reach } : {}),
    };
  } catch {
    return null;
  }
}
