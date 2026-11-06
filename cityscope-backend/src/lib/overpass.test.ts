import { describe, it, expect, vi, beforeEach } from 'vitest';
import { overpassFetch } from './overpass';

const noSleep = async () => {};

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: `status ${status}`,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('overpassFetch', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('retries a 502 then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(502))
      .mockResolvedValueOnce(reply(200, { elements: [{ id: 1 }] }));

    const data = await overpassFetch('[out:json];', { fetchImpl, sleep: noSleep });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(data).toEqual({ elements: [{ id: 1 }] });
  });

  it('gives up after the retries', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => reply(502));

    await expect(overpassFetch('[out:json];', { fetchImpl, sleep: noSleep })).rejects.toThrow(/502/);

    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('does not retry a 400', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => reply(400));

    await expect(overpassFetch('[out:json];', { fetchImpl, sleep: noSleep })).rejects.toThrow(/400/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends the User-Agent', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => reply(200, { elements: [] }));

    await overpassFetch('[out:json];', { fetchImpl, sleep: noSleep });

    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('User-Agent')).toBe('CityScope/1.0 (educational geospatial portfolio)');
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('waits baseDelayMs, doubling on each retry', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(504))
      .mockResolvedValueOnce(reply(200, { elements: [] }));
    const sleep = vi.fn(noSleep);

    await overpassFetch('[out:json];', { fetchImpl, sleep, baseDelayMs: 100 });

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200, 400]);
  });

  it('retries a 200 whose remark says the query hit a runtime error, then succeeds', async () => {
    const partial = { elements: [{ id: 1 }], remark: 'runtime error: Query timed out in "query" at line 3 after 181 seconds.' };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(200, partial))
      .mockResolvedValueOnce(reply(200, { elements: [{ id: 1 }, { id: 2 }] }));
    const sleep = vi.fn(noSleep);

    const data = await overpassFetch('[out:json];', { fetchImpl, sleep, baseDelayMs: 100 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100]);
    expect(data).toEqual({ elements: [{ id: 1 }, { id: 2 }] });
  });

  it('throws with the remark when a 200 keeps reporting a runtime error', async () => {
    const remark = 'runtime error: Query ran out of memory in "query" at line 3.';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => reply(200, { elements: [{ id: 1 }], remark }));

    await expect(overpassFetch('[out:json];', { fetchImpl, sleep: noSleep })).rejects.toThrow(
      /runtime error: Query ran out of memory/,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('retries a fetch that rejects, then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reply(200, { elements: [{ id: 1 }] }));
    const sleep = vi.fn(noSleep);

    const data = await overpassFetch('[out:json];', { fetchImpl, sleep, baseDelayMs: 100 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100]);
    expect(data).toEqual({ elements: [{ id: 1 }] });
  });

  it('rethrows the network error after the last retry', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => {
        throw new TypeError('fetch failed');
      });

    await expect(overpassFetch('[out:json];', { fetchImpl, sleep: noSleep })).rejects.toThrow(
      /fetch failed/,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('returns a 200 without a remark, or with a harmless one, at once', async () => {
    const plain = vi.fn<typeof fetch>().mockImplementation(async () => reply(200, { elements: [{ id: 1 }] }));
    await expect(overpassFetch('[out:json];', { fetchImpl: plain, sleep: noSleep })).resolves.toEqual({
      elements: [{ id: 1 }],
    });
    expect(plain).toHaveBeenCalledTimes(1);

    const harmless = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => reply(200, { elements: [], remark: 'Note: the data is current' }));
    await expect(overpassFetch('[out:json];', { fetchImpl: harmless, sleep: noSleep })).resolves.toEqual({
      elements: [],
      remark: 'Note: the data is current',
    });
    expect(harmless).toHaveBeenCalledTimes(1);
  });
});
