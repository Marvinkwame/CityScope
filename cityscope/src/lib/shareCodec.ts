import type { TravelProfile } from '../store/isochroneStore';
import type { PolygonGeometry } from '../store/drawStore';

export type LngLat = { lng: number; lat: number };

export type ShareTool =
  | { kind: 'isochrone'; profile: TravelProfile; contourMinutes: number[]; origin: LngLat }
  | { kind: 'route'; profile: TravelProfile; origin: LngLat; destination: LngLat }
  | { kind: 'draw'; polygon: PolygonGeometry };

export interface ShareState {
  v: 1;
  city: string;
  view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number };
  layers: { roads: boolean; buildings: boolean; districts: boolean; heatmap: boolean };
  is3D: boolean;
  tool?: ShareTool;
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
    const tool = obj.tool as ShareTool | undefined;
    const validTool =
      tool && (tool.kind === 'isochrone' || tool.kind === 'route' || tool.kind === 'draw') ? tool : undefined;
    return { ...(obj as unknown as ShareState), tool: validTool };
  } catch {
    return null;
  }
}
