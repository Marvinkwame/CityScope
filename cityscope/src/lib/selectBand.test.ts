import { describe, it, expect } from 'vitest';
import { selectBand } from './selectBand';

const BANDS = [{ contour: 5 }, { contour: 10 }, { contour: 15 }];

describe('selectBand', () => {
  it('returns the outermost band when nothing is picked', () => {
    expect(selectBand(BANDS, null)).toBe(BANDS[2]);
  });

  it('returns the picked band when it exists', () => {
    expect(selectBand(BANDS, 10)).toBe(BANDS[1]);
  });

  it('falls back to the outermost band when the pick no longer exists', () => {
    // MAX TIME changed, so the contours are now 5/10 and the old 15 is gone.
    const shorter = [{ contour: 5 }, { contour: 10 }];
    expect(selectBand(shorter, 15)).toBe(shorter[1]);
  });

  it('returns undefined for an empty list', () => {
    expect(selectBand([], null)).toBeUndefined();
    expect(selectBand([], 10)).toBeUndefined();
  });
});
