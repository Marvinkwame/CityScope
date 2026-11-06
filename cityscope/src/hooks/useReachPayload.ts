import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useReachStore } from '../store/reachStore';
import { fetchReach, reachAvailability, shouldRetry } from '../lib/reach/api';
import type { ReachAvailability } from '../lib/reach/api';
import type { ReachPayload } from '../lib/reach/model';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * The city's everyday reach payload (0.1 to 4.8 MB of GeoJSON), fetched when the
 * layer is switched on and kept for the session. Structural sharing is off: it
 * would deep-compare every block on a refetch.
 */
export function useReachPayload(): UseQueryResult<ReachPayload, Error> & { availability: ReachAvailability } {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const enabled = useReachStore((s) => s.enabled);

  const query = useQuery<ReachPayload, Error>({
    queryKey: ['reach', cityId],
    queryFn: () => fetchReach(API_BASE, cityId),
    enabled,
    staleTime: Infinity,
    retry: shouldRetry,
    structuralSharing: false,
  });

  const availability = reachAvailability({
    enabled,
    data: query.data,
    error: query.error,
    isFetching: query.isFetching,
  });
  return { ...query, availability };
}
