import { useQuery } from '@tanstack/react-query';

export interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}

interface GeocodingResponse {
  features: GeocodingFeature[];
}

async function fetchGeocode(
  query: string,
  proximityLng: number,
  proximityLat: number,
  token: string,
): Promise<GeocodingFeature[]> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?proximity=${proximityLng},${proximityLat}&limit=5&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as GeocodingResponse;
  return data.features ?? [];
}

export function useGeocode(query: string, proximityLng: number, proximityLat: number) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string;
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['geocode', trimmed, proximityLng, proximityLat],
    queryFn: () => fetchGeocode(trimmed, proximityLng, proximityLat, token),
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
