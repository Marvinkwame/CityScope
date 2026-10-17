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
});
