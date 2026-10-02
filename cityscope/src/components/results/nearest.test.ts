import { describe, it, expect } from 'vitest';
import { nearestFirst } from './nearest';

const ORIGIN = { lng: 13.4, lat: 52.5 };

// One degree of latitude is about 111.2 km, so these offsets are close to
// 120 m, 450 m and 1.4 km due north of the origin.
const M_120 = 120 / 111195;
const M_450 = 450 / 111195;
const M_1400 = 1400 / 111195;

function place(id: number, name: string | null, dLat: number) {
  return { id, name, category: 'cafe', lng: ORIGIN.lng, lat: ORIGIN.lat + dLat };
}

describe('nearestFirst', () => {
  it('sorts by straight-line distance from the origin', () => {
    const result = nearestFirst(
      [place(1, 'Far', M_1400), place(2, 'Near', M_120), place(3, 'Middle', M_450)],
      ORIGIN,
    );
    expect(result.map((p) => p.name)).toEqual(['Near', 'Middle', 'Far']);
  });

  it('puts the formatted distance in meta', () => {
    const result = nearestFirst(
      [place(1, 'Near', M_120), place(2, 'Far', M_1400)],
      ORIGIN,
    );
    expect(result[0].meta).toBe('120 m');
    expect(result[1].meta).toBe('1.4 km');
  });

  it('keeps the place fields the list needs', () => {
    const [item] = nearestFirst([place(7, 'Cafe Einstein', M_120)], ORIGIN);
    expect(item).toMatchObject({ id: 7, name: 'Cafe Einstein', category: 'cafe', lng: ORIGIN.lng });
  });

  it('breaks equal distances by name, nulls last, then by id', () => {
    const result = nearestFirst(
      [place(4, null, M_120), place(3, 'Zeta', M_120), place(2, 'Alpha', M_120), place(1, 'Alpha', M_120)],
      ORIGIN,
    );
    expect(result.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty list for no places', () => {
    expect(nearestFirst([], ORIGIN)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = [place(1, 'Far', M_1400), place(2, 'Near', M_120)];
    const snapshot = [...input];
    nearestFirst(input, ORIGIN);
    expect(input).toEqual(snapshot);
    expect(input[0]).toBe(snapshot[0]);
    expect(input[1]).toBe(snapshot[1]);
  });
});
