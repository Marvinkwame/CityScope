/** The six everyday needs, the walking-time stops, and the payload and card shapes. */

export type NeedId = 'sm' | 'ph' | 'dr' | 'sc' | 'pk' | 'st';
export type ReachMinutes = 5 | 10 | 15 | 20;

export const REACH_MINUTES: readonly ReachMinutes[] = [5, 10, 15, 20];

export interface ReachNeedInfo {
  id: NeedId;
  label: string;
  /** The POI category whose icon stands for this need. */
  iconCategory: string;
}

/** In display order. */
export const REACH_NEEDS: readonly ReachNeedInfo[] = [
  { id: 'sm', label: 'Supermarket', iconCategory: 'supermarket' },
  { id: 'ph', label: 'Pharmacy', iconCategory: 'pharmacy' },
  { id: 'dr', label: 'Doctor', iconCategory: 'doctors' },
  { id: 'sc', label: 'School', iconCategory: 'school' },
  { id: 'pk', label: 'Park', iconCategory: 'park' },
  { id: 'st', label: 'Station', iconCategory: 'station' },
];

export const NEED_IDS: readonly NeedId[] = REACH_NEEDS.map((n) => n.id);

/** Written for a need with no place in the city. */
export const NONE_FOUND_METRES = 65535;

export function isNeedId(v: unknown): v is NeedId {
  return typeof v === 'string' && (NEED_IDS as readonly string[]).includes(v);
}

export function isReachMinutes(v: unknown): v is ReachMinutes {
  return typeof v === 'number' && (REACH_MINUTES as readonly number[]).includes(v);
}

/** De-duplicated, in display order. */
export function canonicalNeeds(ids: readonly NeedId[]): NeedId[] {
  const wanted = new Set(ids);
  return NEED_IDS.filter((id) => wanted.has(id));
}

/** Keeps a stop the city offers, else falls back to 15, else to the last stop. */
export function pickStop(stops: readonly ReachMinutes[], wanted: ReachMinutes): ReachMinutes | null {
  if (stops.includes(wanted)) return wanted;
  if (stops.includes(15)) return 15;
  return stops.length > 0 ? stops[stops.length - 1] : null;
}

// Keep the types below in step with cityscope-backend/src/lib/reachPayload.ts.

/** `h` is the H3 index, `r` the residents, and each need the metres to its nearest place. */
export type ReachProperties = { h: string; r: number } & Record<NeedId, number>;

export interface ReachFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  properties: ReachProperties;
}

export interface ReachChecks {
  calibrationBaseline?: Partial<Record<ReachMinutes, { insideShare: number; alwaysInsideAgreement: number }>>;
  londonGpShare?: number;
  londonGpPractices?: number;
}

/** How the walks were measured: straight lines at a fitted pace, or along the street network. */
export type ReachMethod = 'estimate' | 'network';

export interface ReachMeta {
  city: string;
  cityName: string;
  coverage: string;
  residents: number;
  method: ReachMethod;
  metresPerMinute: number;
  kLow: number;
  kHigh: number;
  agreement: Record<ReachMinutes, number>;
  stops: ReachMinutes[];
  passes: boolean;
  sampleSize: number;
  needs: { id: NeedId; label: string; source: string; categories: string[] }[];
  builtAt: string;
  sources: {
    places: string;
    population: string;
    placesFetchedAt: string | null;
    osmBase: string | null;
    parksFetchedAt: string | null;
    parksOsmBase: string | null;
    streetsFetchedAt?: string | null;
    streetsOsmBase?: string | null;
    calibratedAt: string;
  };
  completeness: {
    perHundredThousand: Record<NeedId, number>;
    checks: ReachChecks;
  };
}

export interface ReachPayload {
  type: 'FeatureCollection';
  meta: ReachMeta;
  features: ReachFeature[];
}

export interface CellCardNeed {
  need: NeedId;
  name: string | null;
  category: string | null;
  lng: number | null;
  lat: number | null;
  metres: number | null;
  minutes: number | null;
  /** Points from the block's centre to the place; absent on a card cached before walks existed. */
  walk?: [number, number][] | null;
}

export interface CellCard {
  cell: string;
  residents: number;
  metresPerMinute: number;
  needs: CellCardNeed[];
}
