import { describe, it, expect } from 'vitest';
import { CITY_CONFIGS } from './cities';

function cityById(id: string) {
  const city = CITY_CONFIGS.find((c) => c.id === id);
  if (!city) throw new Error(`No city config for ${id}`);
  return city;
}

describe('fetchBounds', () => {
  it.each(CITY_CONFIGS.map((c) => [c.id, c] as const))(
    "%s's fetchBounds contains its bounds, so the download never shrinks",
    (_id, city) => {
      expect(city.fetchBounds.south).toBeLessThanOrEqual(city.bounds.south);
      expect(city.fetchBounds.west).toBeLessThanOrEqual(city.bounds.west);
      expect(city.fetchBounds.north).toBeGreaterThanOrEqual(city.bounds.north);
      expect(city.fetchBounds.east).toBeGreaterThanOrEqual(city.bounds.east);
    },
  );

  it('covers the Amsterdam Zuidoost/Weesp outline', () => {
    const { fetchBounds } = cityById('amsterdam');
    expect(fetchBounds.south).toBeLessThanOrEqual(52.278);
    expect(fetchBounds.east).toBeGreaterThanOrEqual(5.1077);
  });
});

describe('reach config', () => {
  it("gives Tokyo's wards a ' Ku' name suffix", () => {
    expect(cityById('tokyo').reach.districtNameSuffix).toBe(' Ku');
  });

  it('gives every city a non-empty coverage label', () => {
    for (const city of CITY_CONFIGS) {
      expect(city.reach.coverage.length, city.id).toBeGreaterThan(0);
    }
  });
});
