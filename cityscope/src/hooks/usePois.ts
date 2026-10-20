import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useLayerStore } from '../store/layerStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface Poi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

async function fetchPois(cityId: string): Promise<Poi[]> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/pois`);
  if (!res.ok) throw new Error(`Failed to fetch POIs: ${res.status}`);
  return res.json() as Promise<Poi[]>;
}

/**
 * The full POI set for a city, in the 17 displayed categories: about 2.6 MB of
 * JSON for Berlin and 5.4 MB for Tokyo since the 2026-10-20 refetch (estimated
 * from the committed place files, not measured on the API).
 *
 * Only the heatmap layer and its 300 m spotlight need it now that the isochrone
 * join runs in PostGIS, so it is fetched lazily when that layer is switched on.
 * Cached data survives toggling the layer back off, so re-enabling is instant.
 */
export function usePois() {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const heatmapOn = useLayerStore((s) => s.layers.heatmap);

  return useQuery({
    queryKey: ['pois', cityId],
    queryFn: () => fetchPois(cityId),
    enabled: heatmapOn,
    staleTime: 5 * 60 * 1000,
  });
}
