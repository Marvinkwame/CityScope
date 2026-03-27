import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function fetchDistricts(cityId: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/districts`);
  if (!res.ok) throw new Error(`Failed to fetch districts: ${res.status}`);
  return res.json() as Promise<GeoJSON.FeatureCollection>;
}

export function useDistricts() {
  const cityId = useCityStore((s) => s.selectedCity.id);

  return useQuery({
    queryKey: ['districts', cityId],
    queryFn: () => fetchDistricts(cityId),
    staleTime: 5 * 60 * 1000,
  });
}
