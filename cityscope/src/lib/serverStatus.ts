/**
 * What a visitor is waiting on. The API runs on a free tier that sleeps when
 * idle, so the first request can take 8–30 s. The examples (and share links)
 * need both the city list and the map, so "ready" means both have arrived.
 */
export type ServerStatus = 'waking' | 'error' | 'ready';

export function serverStatus(
  cities: { hasData: boolean; isError: boolean },
  mapReady: boolean,
): ServerStatus {
  if (cities.hasData) return mapReady ? 'ready' : 'waking';
  return cities.isError ? 'error' : 'waking';
}
