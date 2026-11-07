import { describe, expect, it } from 'vitest';
import { canonicalNeeds, isNeedId, isReachMinutes, pickStop } from './model';

describe('reach model', () => {
  it('pickStop keeps a passed stop, else falls back to 15, else to the last stop', () => {
    expect(pickStop([5, 10, 15, 20], 10)).toBe(10);
    expect(pickStop([10, 15, 20], 5)).toBe(15);
    expect(pickStop([10, 20], 5)).toBe(20);
    expect(pickStop([], 15)).toBeNull();
  });

  it('canonicalNeeds removes repeats and uses display order', () => {
    expect(canonicalNeeds(['st', 'sm', 'st', 'pk'])).toEqual(['sm', 'pk', 'st']);
  });

  it('recognises need ids and minutes', () => {
    expect(isNeedId('ph')).toBe(true);
    expect(isNeedId('bus')).toBe(false);
    expect(isReachMinutes(20)).toBe(true);
    expect(isReachMinutes('15')).toBe(false);
    expect(isReachMinutes(12)).toBe(false);
  });
});
