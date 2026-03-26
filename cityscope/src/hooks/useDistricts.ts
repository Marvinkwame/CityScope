import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function fetchDistricts(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${API_BASE}/api/districts`);
  if (!res.ok) throw new Error(`Failed to fetch districts: ${res.status}`);
  return res.json() as Promise<GeoJSON.FeatureCollection>;
}

export function useDistricts() {
  return useQuery({
    queryKey: ['districts'],
    queryFn: fetchDistricts,
    staleTime: 5 * 60 * 1000,
  });
}
