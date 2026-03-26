import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface Poi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

async function fetchPois(): Promise<Poi[]> {
  const res = await fetch(`${API_BASE}/api/pois`);
  if (!res.ok) throw new Error(`Failed to fetch POIs: ${res.status}`);
  return res.json() as Promise<Poi[]>;
}

export function usePois() {
  return useQuery({
    queryKey: ['pois'],
    queryFn: fetchPois,
    staleTime: 5 * 60 * 1000,
  });
}
