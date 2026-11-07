import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ReachCellNotFoundError,
  ReachNotBuiltError,
  fetchReach,
  fetchReachCard,
  reachAvailability,
  shouldRetry,
} from './api';
import type { ReachPayload } from './model';

const B = 'http://api.test';

function payload(passes: boolean): ReachPayload {
  return { type: 'FeatureCollection', meta: { city: 'berlin', passes }, features: [] } as unknown as ReachPayload;
}
const PASSING = payload(true);
const FAILING = payload(false);

function stubFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('reach api', () => {
  it('fetchReach returns the payload on 200', async () => {
    stubFetch(200, PASSING);
    const data = await fetchReach(B, 'berlin');
    expect(data.meta.city).toBe('berlin');
  });

  it('a 404 for a city is ReachNotBuiltError', async () => {
    stubFetch(404);
    await expect(fetchReach(B, 'atlantis')).rejects.toBeInstanceOf(ReachNotBuiltError);
  });

  it('a 500 is a plain error', async () => {
    stubFetch(500);
    const err = await fetchReach(B, 'berlin').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ReachNotBuiltError);
    expect((err as Error).message).toContain('500');
  });

  it('a 404 for a block is ReachCellNotFoundError', async () => {
    stubFetch(404);
    await expect(fetchReachCard(B, 'berlin', 'x')).rejects.toBeInstanceOf(ReachCellNotFoundError);
  });

  it('asks for the block under its city', async () => {
    const fn = stubFetch(200, { cell: '891f1d48947ffff' });
    await fetchReachCard(B, 'berlin', '891f1d48947ffff');
    expect(fn).toHaveBeenCalledWith(`${B}/api/cities/berlin/reach/891f1d48947ffff`);
  });

  it('never retries a not-found answer', () => {
    expect(shouldRetry(0, new ReachNotBuiltError())).toBe(false);
    expect(shouldRetry(0, new ReachCellNotFoundError())).toBe(false);
    expect(shouldRetry(1, new Error())).toBe(true);
    expect(shouldRetry(2, new Error())).toBe(false);
  });

  it('reachAvailability covers every state', () => {
    expect(reachAvailability({ enabled: false, data: undefined, error: null, isFetching: false })).toBe('off');
    expect(reachAvailability({ enabled: true, data: undefined, error: null, isFetching: true })).toBe('loading');
    expect(reachAvailability({ enabled: true, data: PASSING, error: null, isFetching: false })).toBe('ready');
    expect(reachAvailability({ enabled: false, data: FAILING, error: null, isFetching: false })).toBe('not-reliable');
    expect(reachAvailability({ enabled: false, data: undefined, error: new ReachNotBuiltError(), isFetching: false })).toBe('not-built');
    expect(reachAvailability({ enabled: true, data: undefined, error: new Error('x'), isFetching: false })).toBe('error');
  });

  it('reports a fetch still running after the switch went off as off, not loading', () => {
    expect(reachAvailability({ enabled: false, data: undefined, error: null, isFetching: true })).toBe('off');
  });
});
