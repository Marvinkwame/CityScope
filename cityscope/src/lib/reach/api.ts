import type { CellCard, ReachPayload } from './model';

/** The city has no published reach data (the API answered 404). Normal, not a failure. */
export class ReachNotBuiltError extends Error {
  constructor() {
    super('No reach data for this city');
    this.name = 'ReachNotBuiltError';
  }
}

/** The block is not in the city's reach data (the API answered 404). */
export class ReachCellNotFoundError extends Error {
  constructor() {
    super('No such block');
    this.name = 'ReachCellNotFoundError';
  }
}

export async function fetchReach(apiBase: string, cityId: string): Promise<ReachPayload> {
  const res = await fetch(`${apiBase}/api/cities/${cityId}/reach`);
  if (res.status === 404) throw new ReachNotBuiltError();
  if (!res.ok) throw new Error(`Failed to fetch reach: ${res.status}`);
  return res.json() as Promise<ReachPayload>;
}

export async function fetchReachCard(apiBase: string, cityId: string, cell: string): Promise<CellCard> {
  const res = await fetch(`${apiBase}/api/cities/${cityId}/reach/${cell}`);
  if (res.status === 404) throw new ReachCellNotFoundError();
  if (!res.ok) throw new Error(`Failed to fetch reach card: ${res.status}`);
  return res.json() as Promise<CellCard>;
}

/** A not-found answer will not change on a retry; anything else gets two more tries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ReachNotBuiltError || error instanceof ReachCellNotFoundError) return false;
  return failureCount < 2;
}

export type ReachAvailability = 'off' | 'loading' | 'ready' | 'not-built' | 'not-reliable' | 'error';

/** "Not built" and "not reliable" hold even while the switch is off, so the switch can be disabled. */
export function reachAvailability(q: {
  enabled: boolean;
  data: ReachPayload | undefined;
  error: unknown;
  isFetching: boolean;
}): ReachAvailability {
  if (q.data) return q.data.meta.passes ? 'ready' : 'not-reliable';
  if (q.error instanceof ReachNotBuiltError) return 'not-built';
  if (q.error) return q.enabled ? 'error' : 'off';
  if (q.isFetching) return 'loading';
  return 'off';
}
