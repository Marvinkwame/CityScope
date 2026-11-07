import { useMemo } from 'react';
import { useReachStore } from '../store/reachStore';
import { summarise, toColumns } from '../lib/reach/summary';
import type { ReachColumns, ReachSummary } from '../lib/reach/summary';
import type { ReachMeta, ReachMinutes } from '../lib/reach/model';
import { useReachPayload } from './useReachPayload';

export interface ReachSummaryResult {
  meta: ReachMeta;
  columns: ReachColumns;
  summary: ReachSummary;
}

/**
 * The city-wide headline for the chosen needs and time (or the given time, to
 * preview a stop). The column pass runs once per payload; the summary pass
 * reruns only when the needs, the time or the speed change.
 */
export function useReachSummary(minutes?: ReachMinutes): ReachSummaryResult | null {
  const { data: payload } = useReachPayload();
  const needs = useReachStore((s) => s.needs);
  const storeMinutes = useReachStore((s) => s.minutes);
  const chosen = minutes ?? storeMinutes;

  const columns = useMemo(() => (payload ? toColumns(payload.features) : null), [payload]);
  const meta = payload?.meta;
  const k = meta?.metresPerMinute;
  const kLow = meta?.kLow;
  const kHigh = meta?.kHigh;

  const summary = useMemo(
    () =>
      columns && k !== undefined && kLow !== undefined && kHigh !== undefined
        ? summarise(columns, needs, chosen, { k, kLow, kHigh })
        : null,
    [columns, needs, chosen, k, kLow, kHigh],
  );

  return meta && columns && summary ? { meta, columns, summary } : null;
}
