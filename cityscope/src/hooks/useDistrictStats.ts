import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface DistrictCategoryCount {
  category: string;
  count: number;
}

export interface DistrictStats {
  districtId: number;
  name: string;
  poiCount: number;
  areaKm2: number;
  densityPerKm2: number;
  topCategories: DistrictCategoryCount[];
  cityAvgDensity: number;
  densityVsCityPct: number | null;
}

async function fetchDistrictStats(
  cityId: string,
  districtId: string | number,
): Promise<DistrictStats> {
  const res = await fetch(
    `${API_BASE}/api/cities/${cityId}/districts/${districtId}/stats`,
  );
  if (!res.ok) throw new Error(`Failed to fetch district stats: ${res.status}`);
  return res.json() as Promise<DistrictStats>;
}

export function useDistrictStats(
  cityId: string,
  districtId: string | number | undefined,
) {
  return useQuery({
    queryKey: ['district-stats', cityId, districtId],
    queryFn: () => fetchDistrictStats(cityId, districtId as string | number),
    enabled: districtId !== undefined && districtId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
