import { describe, it, expect } from 'vitest';
import { REACH_CACHE_CONTROL, acceptsBrotli, isFresh, isH3CellId } from './reachHttp';

describe('REACH_CACHE_CONTROL', () => {
  it('is public and lasts a day', () => {
    expect(REACH_CACHE_CONTROL).toBe('public, max-age=86400');
  });
});

describe('acceptsBrotli', () => {
  it('is true when br is listed, in any case, with a q that is not 0', () => {
    expect(acceptsBrotli('gzip, deflate, br')).toBe(true);
    expect(acceptsBrotli('BR')).toBe(true);
    expect(acceptsBrotli('br;q=0.5')).toBe(true);
  });

  it('is false when br is refused or absent', () => {
    expect(acceptsBrotli('br;q=0')).toBe(false);
    expect(acceptsBrotli('gzip')).toBe(false);
    expect(acceptsBrotli(undefined)).toBe(false);
  });
});

describe('isFresh', () => {
  it('matches the same tag, weak or strong', () => {
    expect(isFresh('"abc"', '"abc"')).toBe(true);
    expect(isFresh('W/"abc"', '"abc"')).toBe(true);
  });

  it('matches any tag in a list, and *', () => {
    expect(isFresh('"x", "abc"', '"abc"')).toBe(true);
    expect(isFresh('*', '"abc"')).toBe(true);
  });

  it('does not match a missing or different tag', () => {
    expect(isFresh(undefined, '"abc"')).toBe(false);
    expect(isFresh('"abd"', '"abc"')).toBe(false);
  });
});

describe('isH3CellId', () => {
  it('accepts a lower-case resolution 9 index', () => {
    expect(isH3CellId('891f1d48947ffff')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isH3CellId('881f1d4895fffff')).toBe(false); // resolution 8
    expect(isH3CellId('891F1D48947FFFF')).toBe(false); // upper case
    expect(isH3CellId('891f1d48947fff')).toBe(false); // too short
    expect(isH3CellId('891f1d48947ffffa')).toBe(false); // too long
    expect(isH3CellId('../etc/passwd')).toBe(false);
  });
});
