import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useReachStore } from '../store/reachStore';
import { ReachCellNotFoundError, fetchReachCard, shouldRetry } from '../lib/reach/api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** The card for the selected block. A block the API does not know is dropped from the selection. */
export function useReachCard() {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const reachOn = useReachStore((s) => s.enabled);
  const selectedCell = useReachStore((s) => s.selectedCell);

  const query = useQuery({
    queryKey: ['reach-card', cityId, selectedCell],
    queryFn: () => fetchReachCard(API_BASE, cityId, selectedCell as string),
    enabled: reachOn && selectedCell !== null,
    retry: shouldRetry,
  });

  const notFound = query.error instanceof ReachCellNotFoundError;
  useEffect(() => {
    if (notFound) useReachStore.getState().selectCell(null);
  }, [notFound]);

  return query;
}
