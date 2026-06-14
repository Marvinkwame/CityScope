import { useQuery } from '@tanstack/react-query';
import type { PolygonGeometry } from '../store/drawStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface AreaCategoryCount {
  category: string;
  count: number;
}

export interface AreaStats {
  poiCount: number;
  areaKm2: number;
  densityPerKm2: number;
  topCategories: AreaCategoryCount[];
}

async function fetchAreaStats(
  cityId: string,
  polygon: PolygonGeometry,
): Promise<AreaStats> {
  const res = await fetch(`${API_BASE}/api/cities/${cityId}/pois/within`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon }),
  });
  if (!res.ok) throw new Error(`Area analysis failed: ${res.status}`);
  return res.json() as Promise<AreaStats>;
}

export function useAreaAnalysis(cityId: string, polygon: PolygonGeometry | null) {
  return useQuery({
    queryKey: ['area-analysis', cityId, polygon ? JSON.stringify(polygon) : null],
    queryFn: () => fetchAreaStats(cityId, polygon as PolygonGeometry),
    enabled: polygon !== null,
    staleTime: 5 * 60 * 1000,
  });
}
