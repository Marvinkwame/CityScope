import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCityStore } from '../store/cityStore';
import { useReachStore } from '../store/reachStore';
import { useReachPayload } from './useReachPayload';
import { cardIsStale, cardRequestable, healKey, shouldHeal } from '../lib/reach/card';
import { ReachCellNotFoundError, fetchReach, fetchReachCard, shouldRetry } from '../lib/reach/api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Module-level: MapView and ReachCard both call this hook, and one set keeps
// them from healing the same block twice.
const healAttempts = new Set<string>();

/** The card for the selected block. A block the API does not know is dropped from the selection. */
export function useReachCard() {
  const cityId = useCityStore((s) => s.selectedCity.id);
  const reachOn = useReachStore((s) => s.enabled);
  const selectedCell = useReachStore((s) => s.selectedCell);

  const payload = useReachPayload().data;
  // Only a block the current city's payload lists: on a city change the old
  // block is still selected for one render, and its request would 404.
  const requestable = useMemo(
    () => cardRequestable(reachOn, selectedCell, payload),
    [reachOn, selectedCell, payload],
  );

  const query = useQuery({
    queryKey: ['reach-card', cityId, selectedCell],
    queryFn: () => fetchReachCard(API_BASE, cityId, selectedCell as string),
    enabled: requestable,
    retry: shouldRetry,
  });

  const queryClient = useQueryClient();
  const card = query.data;
  useEffect(() => {
    if (!card || !payload || selectedCell === null) return;
    const props = payload.features.find((f) => f.properties.h === selectedCell)?.properties;
    if (!props) return;
    const key = healKey(payload, selectedCell);
    if (!shouldHeal(healAttempts, key, cardIsStale(card, props, payload.meta.metresPerMinute))) return;
    healAttempts.add(key);
    // The browser may hold a day-old copy of either; fetch both past its cache.
    const cell = selectedCell;
    Promise.all([
      fetchReach(API_BASE, cityId, 'reload'),
      fetchReachCard(API_BASE, cityId, cell, 'reload'),
    ])
      .then(([freshPayload, freshCard]) => {
        queryClient.setQueryData(['reach', cityId], freshPayload);
        queryClient.setQueryData(['reach-card', cityId, cell], freshCard);
      })
      .catch(() => {
        // Keep today's message; one attempt per key, no retry.
      });
  }, [card, payload, selectedCell, cityId, queryClient]);

  const notFound = query.error instanceof ReachCellNotFoundError;
  useEffect(() => {
    if (notFound) useReachStore.getState().selectCell(null);
  }, [notFound]);

  return query;
}
