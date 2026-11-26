/**
 * One call to the Overpass API, with the retries its public servers need.
 *
 * Overpass sheds load by answering 429 (too many requests) or 502/503/504
 * (overloaded, or the query ran out of time) and then recovers a little later.
 * A call that gets one of those waits and tries again, doubling the wait each
 * time. Any other failure, a 400 for a query that does not parse for one,
 * would only fail the same way again, so it throws at once.
 *
 * Two failures arrive without a retryable status, and both are retried the same
 * way. A server that runs out of time or memory partway through can still answer
 * 200, with the elements it had found and a `remark` that starts "runtime error":
 * the answer is partial, and a city seeded from it would silently lose places.
 * And a connection that resets or times out makes `fetch` reject rather than
 * return a response.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Overpass answers 406 to a request that does not say who is asking. */
const USER_AGENT = 'CityScope/1.0 (educational geospatial project)';

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

/**
 * The remark Overpass attaches to a partial answer, or null for a whole one.
 * Other remarks (notes about the data) are harmless and do not count.
 */
function runtimeErrorRemark(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const remark = (body as { remark?: unknown }).remark;
  return typeof remark === 'string' && remark.includes('runtime error') ? remark : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One call's result: the answer, or why it is worth another go and what to throw if it is the last. */
type Attempt = { body: unknown } | { said: string; error: Error };

async function attemptOnce(query: string, fetchImpl: typeof fetch): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetchImpl(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { said: `a network error (${error.message})`, error };
  }

  if (res.ok) {
    const body: unknown = await res.json();
    const remark = runtimeErrorRemark(body);
    if (remark === null) return { body };
    return {
      said: `a partial answer (${remark})`,
      error: new Error(`Overpass API answered with a partial result: ${remark}`),
    };
  }

  const error = new Error(`Overpass API returned ${res.status}: ${res.statusText}`);
  if (!RETRYABLE_STATUSES.has(res.status)) throw error;
  return { said: String(res.status), error };
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
    const result = await attemptOnce(query, fetchImpl);
    if ('body' in result) return result.body;

    if (attempt >= retries) throw result.error;

    const delayMs = baseDelayMs * 2 ** attempt;
    console.warn(
      `Overpass API gave ${result.said}; retry ${attempt + 1} of ${retries} in ${delayMs / 1000} s`,
    );
    await sleep(delayMs);
  }
}
