import { describe, it, expect } from 'vitest';
import { parseGpPractices, percentile, shareWithin } from './gpCoverage';

// A row in the layout of NHS England's epraccur file: headerless, 27 columns,
// every field double-quoted. Column 0 is the practice code, 9 the postcode,
// 12 the status as a word, 25 the primary role (RO76 = GP practice).
function row(code: string, postcode: string, status: string, role: string, name = 'THE TEST SURGERY'): string {
  const fields = new Array<string>(27).fill('');
  fields[0] = code;
  fields[1] = name;
  fields[2] = 'Y63';
  fields[9] = postcode;
  fields[12] = status;
  fields[25] = role;
  return fields.map((f) => `"${f.replaceAll('"', '""')}"`).join(',');
}

describe('parseGpPractices', () => {
  it('keeps an active GP practice with its code and postcode, and nothing else', () => {
    const csv = [
      row('A81001', 'TS18 1HU', 'ACTIVE', 'RO76'),
      row('A81003', 'TS26 8DB', 'INACTIVE', 'RO76'),
      row('A81008', 'TS19 0AB', 'ACTIVE', 'RO247'),
    ].join('\n');

    expect(parseGpPractices(csv)).toEqual([{ code: 'A81001', postcode: 'TS18 1HU' }]);
  });

  it('drops dormant practices too', () => {
    expect(parseGpPractices(row('A1', 'AB1 2CD', 'DORMANT', 'RO76'))).toEqual([]);
  });

  it('reads a field that holds a comma, a doubled quote or a line break as one field', () => {
    const csv = [
      row('B1', 'E1 6AN', 'ACTIVE', 'RO76', 'SMITH, JONES & PARTNERS'),
      row('B2', 'E2 7BQ', 'ACTIVE', 'RO76', 'THE "OLD" SURGERY'),
      row('B3', 'E3 8CR', 'ACTIVE', 'RO76', 'FIRST LINE\nSECOND LINE'),
    ].join('\r\n');

    expect(parseGpPractices(csv)).toEqual([
      { code: 'B1', postcode: 'E1 6AN' },
      { code: 'B2', postcode: 'E2 7BQ' },
      { code: 'B3', postcode: 'E3 8CR' },
    ]);
  });

  it('copes with a trailing newline, a blank line and a short row', () => {
    const csv = [row('C1', 'N1 1AA', 'ACTIVE', 'RO76'), '', '"C2","SHORT ROW"', ''].join('\n');
    expect(parseGpPractices(csv)).toEqual([{ code: 'C1', postcode: 'N1 1AA' }]);
  });

  it('trims the postcode', () => {
    expect(parseGpPractices(row('D1', ' SW1A 1AA ', 'ACTIVE', 'RO76'))).toEqual([{ code: 'D1', postcode: 'SW1A 1AA' }]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseGpPractices('')).toEqual([]);
  });
});

describe('shareWithin', () => {
  it('is the fraction of distances at or under the limit', () => {
    expect(shareWithin([100, 149, 151, 400], 150)).toBe(0.5);
  });

  it('counts a distance exactly at the limit as within', () => {
    expect(shareWithin([150, 150.5], 150)).toBe(0.5);
  });

  it('is 0 for an empty list', () => {
    expect(shareWithin([], 150)).toBe(0);
  });

  it('is 1 when every distance is within and 0 when none is', () => {
    expect(shareWithin([1, 2, 3], 150)).toBe(1);
    expect(shareWithin([500, 600], 150)).toBe(0);
  });
});

describe('percentile', () => {
  it('is the middle value at 0.5 for an odd count', () => {
    expect(percentile([30, 10, 20], 0.5)).toBe(20);
  });

  it('interpolates between the two middle values for an even count', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it('gives the smallest at 0 and the largest at 1, and does not reorder its input', () => {
    const values = [5, 1, 9];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 1)).toBe(9);
    expect(values).toEqual([5, 1, 9]);
  });

  it('is 0 for an empty list', () => {
    expect(percentile([], 0.9)).toBe(0);
  });
});
