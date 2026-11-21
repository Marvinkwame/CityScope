import { describe, expect, it } from 'vitest';
import { isReachMethod, methodOfRows } from './reachMethod';

describe('methodOfRows', () => {
  it('returns the one method the rows were built with', () => {
    expect(methodOfRows(['network'])).toBe('network');
    expect(methodOfRows(['estimate'])).toBe('estimate');
  });

  it('throws when there are no rows', () => {
    expect(() => methodOfRows([])).toThrow(/no nearest places/);
  });

  it('throws when the rows mix methods', () => {
    expect(() => methodOfRows(['estimate', 'network'])).toThrow(/mixes/);
  });

  it('throws on an unknown method', () => {
    expect(() => methodOfRows(['bus'])).toThrow(/unknown/);
  });
});

describe('isReachMethod', () => {
  it('accepts the two methods only', () => {
    expect(isReachMethod('estimate')).toBe(true);
    expect(isReachMethod('network')).toBe(true);
    expect(isReachMethod('bus')).toBe(false);
    expect(isReachMethod(null)).toBe(false);
  });
});
