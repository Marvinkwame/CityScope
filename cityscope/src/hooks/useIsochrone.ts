import { useQuery } from '@tanstack/react-query';
import { useIsochroneStore } from '../store/isochroneStore';

async function fetchIsochrone(
  profile: string,
  lng: number,
  lat: number,
  contourMinutes: number[],
  token: string,
): Promise<GeoJSON.FeatureCollection> {
  const minutes = contourMinutes.join(',');
  const url =
    `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${lng},${lat}` +
    `?contours_minutes=${minutes}&polygons=true&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Isochrone API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<GeoJSON.FeatureCollection>;
}

export function useIsochrone() {
  const enabled = useIsochroneStore((s) => s.enabled);
  const profile = useIsochroneStore((s) => s.profile);
  const contourMinutes = useIsochroneStore((s) => s.contourMinutes);
  const origin = useIsochroneStore((s) => s.origin);
  const setLoading = useIsochroneStore((s) => s.setLoading);
  const setError = useIsochroneStore((s) => s.setError);

  const token = import.meta.env.VITE_MAPBOX_TOKEN as string;

  return useQuery({
    queryKey: ['isochrone', origin?.lng, origin?.lat, profile, contourMinutes],
    queryFn: async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchIsochrone(
          profile,
          origin!.lng,
          origin!.lat,
          contourMinutes,
          token,
        );
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch isochrone';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    enabled: enabled && origin !== null,
    staleTime: 5 * 60 * 1000,
  });
}
