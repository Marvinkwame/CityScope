import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBuildArgs } from './buildReachArgs.js';

const DEFAULT = path.resolve('default-ghsl');

describe('parseBuildArgs', () => {
  it('defaults the method to network', () => {
    expect(parseBuildArgs(['berlin'], DEFAULT)).toEqual({
      cityId: 'berlin',
      ghslDir: DEFAULT,
      dryRun: false,
      method: 'network',
    });
  });

  it('accepts --method estimate', () => {
    expect(parseBuildArgs(['berlin', '--method', 'estimate'], DEFAULT)?.method).toBe('estimate');
  });

  it('rejects an unknown method', () => {
    expect(parseBuildArgs(['berlin', '--method', 'walk'], DEFAULT)).toBeNull();
  });

  it('rejects --method with no value', () => {
    expect(parseBuildArgs(['berlin', '--method'], DEFAULT)).toBeNull();
  });

  it('keeps --dry-run and --ghsl', () => {
    expect(parseBuildArgs(['berlin', '--dry-run', '--ghsl', 'x'], DEFAULT)).toEqual({
      cityId: 'berlin',
      ghslDir: path.resolve('x'),
      dryRun: true,
      method: 'network',
    });
  });

  it('rejects two city ids', () => {
    expect(parseBuildArgs(['berlin', 'tokyo'], DEFAULT)).toBeNull();
  });

  it('rejects no city', () => {
    expect(parseBuildArgs([], DEFAULT)).toBeNull();
  });
});
