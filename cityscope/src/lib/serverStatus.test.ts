import { describe, it, expect } from 'vitest';
import { serverStatus } from './serverStatus';

describe('serverStatus', () => {
  it('is waking while the city list is still loading', () => {
    expect(serverStatus({ hasData: false, isError: false }, true)).toBe('waking');
  });

  it('is an error when the city list request failed', () => {
    expect(serverStatus({ hasData: false, isError: true }, true)).toBe('error');
  });

  it('reports the error even before the map exists', () => {
    expect(serverStatus({ hasData: false, isError: true }, false)).toBe('error');
  });

  it('is ready only with both the city list and the map', () => {
    expect(serverStatus({ hasData: true, isError: false }, true)).toBe('ready');
  });

  it('keeps waking while the map is still being created', () => {
    expect(serverStatus({ hasData: true, isError: false }, false)).toBe('waking');
  });
});
