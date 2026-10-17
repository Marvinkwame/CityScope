/**
 * One call to the Overpass API, with the retries its public servers need.
 *
 * Overpass sheds load by answering 429 (too many requests) or 502/503/504
 * (overloaded, or the query ran out of time) and then recovers a little later.
 * A call that gets one of those waits and tries again, doubling the wait each
 * time. Any other failure, a 400 for a query that does not parse for one,
 * would only fail the same way again, so it throws at once.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Overpass answers 406 to a request that does not say who is asking. */
const USER_AGENT = 'CityScope/1.0 (educational geospatial portfolio)';

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

export interface OverpassFetchOptions {
  /** The fetch to call. Tests pass a fake. */
  fetchImpl?: typeof fetch;
  /** How the wait between attempts happens. Tests pass one that returns at once. */
  sleep?: (ms: number) => Promise<void>;
  /** How many times to retry after the first attempt: `retries + 1` calls in all. */
  retries?: number;
  /** The wait before the first retry. Each later retry waits twice as long as the one before. */
  baseDelayMs?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs an Overpass QL query and returns the parsed JSON response.
 *
 * Throws when the response is not OK and is not worth retrying, or when it is
 * still failing after the last retry.
 */
export async function overpassFetch(
  query: string,
  opts: OverpassFetchOptions = {},
): Promise<unknown> {
  const { fetchImpl = fetch, sleep = wait, retries = 4, baseDelayMs = 30_000 } = opts;

  for (let attempt = 0; ; attempt += 1) {
    const res = await fetchImpl(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (res.ok) return res.json();

    if (!RETRYABLE_STATUSES.has(res.status) || attempt >= retries) {
      throw new Error(`Overpass API returned ${res.status}: ${res.statusText}`);
    }

    const delayMs = baseDelayMs * 2 ** attempt;
    console.warn(
      `Overpass API returned ${res.status}; retry ${attempt + 1} of ${retries} in ${delayMs / 1000} s`,
    );
    await sleep(delayMs);
  }
}
