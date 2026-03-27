import { useQuery } from '@tanstack/react-query';
import type { City } from '../store/cityStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function fetchCities(): Promise<City[]> {
  const res = await fetch(`${API_BASE}/api/cities`);
  if (!res.ok) throw new Error(`Failed to fetch cities: ${res.status}`);
  return res.json() as Promise<City[]>;
}

export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: fetchCities,
    staleTime: Infinity,
  });
}
