import { describe, expect, it } from 'vitest';
import { NEEDS, PARK_MIN_AREA_M2 } from './needs';
import type { Need } from './needs';
import { placeCountQuery } from './needPlaces';

function need(id: string): Need {
  const found = NEEDS.find((n) => n.id === id);
  if (!found) throw new Error(`no need ${id}`);
  return found;
}

describe('placeCountQuery', () => {
  it("counts a POI need's places in the city by its categories", () => {
    const q = placeCountQuery(need('dr'), 'berlin');
    expect(q.text).toMatch(/FROM pois\b/);
    expect(q.text).toMatch(/city_id = \$1/);
    expect(q.text).toMatch(/category = ANY\(\$2::text\[\]\)/);
    expect(q.values).toEqual(['berlin', ['doctors', 'clinic']]);
  });

  it('counts every station category, as the nearest-place search uses them all', () => {
    expect(placeCountQuery(need('st'), 'sydney').values).toEqual([
      'sydney',
      ['station', 'halt', 'tram_stop', 'subway_entrance'],
    ]);
  });

  it('counts only parks of the minimum area for the park need', () => {
    const q = placeCountQuery(need('pk'), 'paris');
    expect(q.text).toMatch(/FROM parks\b/);
    expect(q.text).toMatch(/area_m2 >= \$2/);
    expect(q.values).toEqual(['paris', PARK_MIN_AREA_M2]);
  });

  it('names its count column places', () => {
    for (const n of NEEDS) expect(placeCountQuery(n, 'tokyo').text).toMatch(/count\(\*\)::int AS places/);
  });
});
