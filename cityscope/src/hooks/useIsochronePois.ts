import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { toContourPayload, type ContourPayloadEntry } from '../lib/isochronePayload';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface BandPoi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

export interface IsochroneBandResult {
  contour: number;
  poiCount: number;
  categoryCounts: Record<string, number>;
  pois: BandPoi[];
}

async function fetchIsochronePois(
  cityId: string,
  contours: ContourPayloadEntry[],
): Promise<IsochroneBandResult[]> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/pois/in-isochrone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contours }),
  });
  if (!res.ok) throw new Error(`Isochrone POI query failed: ${res.status}`);
  const json = (await res.json()) as { bands: IsochroneBandResult[] };
  return json.bands;
}

/**
 * Server-side POI-in-band join.
 *
 * Keyed on the same inputs that determine the isochrone itself rather than on a
 * hash of the geometry — cheaper and legible in devtools. That is safe because
 * useIsochrone keys on those same inputs and does not use placeholderData, so
 * its data goes undefined when the key changes. The !!isochroneData guard
 * therefore prevents posting the previous origin's polygons under a new key.
 */
export function useIsochronePois(isochroneData: GeoJSON.FeatureCollection | undefined) {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const enabled = useIsochroneStore((s) => s.enabled);
  const origin = useIsochroneStore((s) => s.origin);
  const profile = useIsochroneStore((s) => s.profile);
  const contourMinutes = useIsochroneStore((s) => s.contourMinutes);

  return useQuery({
    queryKey: [
      'isochrone-pois',
      cityId,
      origin?.lng,
      origin?.lat,
      profile,
      contourMinutes.join(','),
    ],
    queryFn: () => fetchIsochronePois(cityId, toContourPayload(isochroneData)),
    enabled: enabled && origin !== null && !!isochroneData,
    staleTime: 5 * 60 * 1000,
  });
}
