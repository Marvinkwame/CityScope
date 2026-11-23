/**
 * The small HTTP rules the reach API follows: how long a reply may be cached,
 * whether the client can take Brotli, whether its cached copy is still the
 * current one, and what a cell id looks like.
 *
 * Plain functions, so the router stays thin and these rules are tested alone.
 */

/** Reach is rebuilt rarely, by hand, so a day is a safe lifetime. */
export const REACH_CACHE_CONTROL = 'public, max-age=86400';

/**
 * Whether an `Accept-Encoding` header lets us send Brotli: a `br` token, in any
 * case, whose q-value is not 0. A q-value that is not a number is not trusted;
 * the caller then sends the plain bytes, which every client can read.
 */
export function acceptsBrotli(acceptEncoding: string | undefined): boolean {
  if (!acceptEncoding) return false;

  for (const part of acceptEncoding.split(',')) {
    const [token, ...params] = part.split(';').map((piece) => piece.trim());
    if (token.toLowerCase() !== 'br') continue;

    const q = params.find((param) => /^q\s*=/i.test(param));
    if (q === undefined) return true;

    const weight = Number(q.slice(q.indexOf('=') + 1).trim());
    return Number.isFinite(weight) && weight > 0;
  }
  return false;
}

function stripWeak(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

/**
 * Whether the client's `If-None-Match` names the current ETag, so the reply
 * can be a 304. `*` matches anything, and a leading `W/` is ignored: for
 * `If-None-Match`, a weak comparison is the one the HTTP rules prescribe.
 */
export function isFresh(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;

  const wanted = stripWeak(etag);
  return ifNoneMatch.split(',').some((candidate) => {
    const tag = candidate.trim();
    return tag === '*' || stripWeak(tag) === wanted;
  });
}

/**
 * Whether a database error is Postgres's "undefined table" (SQLSTATE 42P01):
 * the reach tables do not exist yet because migration 004 has not been applied.
 * For a client that is the same as a city with nothing published, so the
 * routes answer it with the same 404 rather than a 500.
 */
export function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '42P01';
}

/**
 * True for Postgres's undefined-column error (SQLSTATE 42703): a database
 * where migration 005, which adds the walk column, has not been applied yet.
 */
export function isMissingColumn(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '42703';
}

/** An H3 index at resolution 9, in lower case: 15 hex digits starting `89`. */
export function isH3CellId(value: string): boolean {
  return /^89[0-9a-f]{13}$/.test(value);
}
