import { describe, it, expect } from 'vitest';
import { categoryLabel, distanceParts, formatCount, formatDistance, formatShare } from './format';

describe('formatCount', () => {
  it('groups thousands with commas', () => {
    expect(formatCount(3350)).toBe('3,350');
    expect(formatCount(179819)).toBe('179,819');
  });

  it('leaves small numbers alone', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(85)).toBe('85');
  });

  it('rounds to a whole number', () => {
    expect(formatCount(84.6)).toBe('85');
  });
});

describe('formatShare', () => {
  it('shows a fraction as a whole percentage', () => {
    expect(formatShare(0.2757)).toBe('28%');
    expect(formatShare(1)).toBe('100%');
    expect(formatShare(0)).toBe('0%');
  });

  it('never shows a real share as 0%', () => {
    expect(formatShare(0.004)).toBe('<1%');
    expect(formatShare(0.005)).toBe('1%');
  });
});

describe('formatDistance', () => {
  it('uses metres below 1 km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(120)).toBe('120 m');
    expect(formatDistance(999.4)).toBe('999 m');
  });

  it('switches to kilometres at 1 km, one decimal', () => {
    expect(formatDistance(999.6)).toBe('1.0 km');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1400)).toBe('1.4 km');
    expect(formatDistance(6420)).toBe('6.4 km');
  });

  it('splits into a value and a unit for stat rows', () => {
    expect(distanceParts(120)).toEqual({ value: '120', unit: 'm' });
    expect(distanceParts(6420)).toEqual({ value: '6.4', unit: 'km' });
  });
});

describe('categoryLabel', () => {
  it('capitalises the first letter', () => {
    expect(categoryLabel('restaurant')).toBe('Restaurant');
  });

  it('uses the override for a category that reads badly capitalised', () => {
    expect(categoryLabel('doctors')).toBe('Doctor');
    expect(categoryLabel('halt')).toBe('Rail halt');
  });

  it('capitalises the new single-word categories as they are', () => {
    expect(categoryLabel('school')).toBe('School');
  });

  it('copes with an empty string', () => {
    expect(categoryLabel('')).toBe('');
  });
});
