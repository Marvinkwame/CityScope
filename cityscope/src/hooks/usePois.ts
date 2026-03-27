import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';

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

export function usePois() {
  const cityId = useCityStore((s) => s.selectedCity.id);

  return useQuery({
    queryKey: ['pois', cityId],
    queryFn: () => fetchPois(cityId),
    staleTime: 5 * 60 * 1000,
  });
}
