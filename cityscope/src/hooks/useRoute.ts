import { useQuery } from '@tanstack/react-query';
import { useRouteStore } from '../store/routeStore';

export interface RouteStep {
  instruction: string;
  distanceM: number;
  maneuverType: string;
  maneuverModifier?: string;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  geometry: GeoJSON.LineString;
  steps: RouteStep[];
}

interface MapboxDirectionsStep {
  distance: number;
  maneuver: {
    instruction: string;
    type: string;
    modifier?: string;
  };
}

interface MapboxDirectionsResponse {
  routes: Array<{
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
    legs: Array<{ steps: MapboxDirectionsStep[] }>;
  }>;
}

async function fetchRoute(
  profile: string,
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number,
  token: string,
): Promise<RouteResult> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}` +
    `/${originLng},${originLat};${destLng},${destLat}` +
    `?steps=true&geometries=geojson&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Directions API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as MapboxDirectionsResponse;

  const route = data.routes[0];
  if (!route) throw new Error('No route found between these points');

  const steps: RouteStep[] = (route.legs[0]?.steps ?? []).map((s) => ({
    instruction: s.maneuver.instruction,
    distanceM: s.distance,
    maneuverType: s.maneuver.type,
    maneuverModifier: s.maneuver.modifier,
  }));

  return {
    distanceM: route.distance,
    durationS: route.duration,
    geometry: route.geometry,
    steps,
  };
}

export function useRoute() {
  const enabled = useRouteStore((s) => s.enabled);
  const profile = useRouteStore((s) => s.profile);
  const origin = useRouteStore((s) => s.origin);
  const destination = useRouteStore((s) => s.destination);
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string;

  return useQuery({
    queryKey: [
      'route',
      origin?.lng,
      origin?.lat,
      destination?.lng,
      destination?.lat,
      profile,
    ],
    queryFn: () =>
      fetchRoute(
        profile,
        origin!.lng,
        origin!.lat,
        destination!.lng,
        destination!.lat,
        token,
      ),
    enabled: enabled && origin !== null && destination !== null,
    staleTime: 5 * 60 * 1000,
  });
}
