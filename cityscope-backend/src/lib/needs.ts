/**
 * The six everyday needs that "Everyday reach" measures: for each populated
 * block, the walking distance to the nearest of each.
 *
 * Plain data. Each need names the POI categories (see poiCategories.ts) that
 * count towards it, or says its destinations come from somewhere else.
 */

export type NeedId = 'sm' | 'ph' | 'dr' | 'sc' | 'pk' | 'st';

export interface Need {
  id: NeedId;
  /** What the reader sees. */
  label: string;
  /** `pois` needs read the pois table; `parks` come from the park files. */
  source: 'pois' | 'parks';
  /** POI categories that satisfy the need. Empty when the source is `parks`. */
  categories: readonly string[];
}

/** In display order. */
export const NEEDS: readonly Need[] = [
  { id: 'sm', label: 'Supermarket', source: 'pois', categories: ['supermarket'] },
  { id: 'ph', label: 'Pharmacy', source: 'pois', categories: ['pharmacy'] },
  { id: 'dr', label: 'Doctor', source: 'pois', categories: ['doctors', 'clinic'] },
  { id: 'sc', label: 'School', source: 'pois', categories: ['school'] },
  { id: 'pk', label: 'Park', source: 'parks', categories: [] },
  { id: 'st', label: 'Station', source: 'pois', categories: ['station', 'halt', 'tram_stop', 'subway_entrance'] },
];

export const NEED_IDS: readonly NeedId[] = NEEDS.map((n) => n.id);

/**
 * Station categories that exist only to measure the station need. They never
 * appear in place lists, district statistics or area results, which they
 * would flood.
 */
export const MEASUREMENT_ONLY_CATEGORIES: readonly string[] = ['tram_stop', 'subway_entrance'];

/**
 * The categories counted when a need's places are counted per 100,000
 * residents (the completeness figures in each payload's meta). For the station
 * need that is only `station` and `halt`: a metro station has several mapped
 * entrances and a tram line a stop every few hundred metres, so counting
 * `tram_stop` and `subway_entrance` would measure how entrances and stops are
 * mapped, not how many stations a city has. The nearest-place distance for the
 * station need still uses all four categories.
 */
export function completenessCategories(need: Need): readonly string[] {
  return need.categories.filter((category) => !MEASUREMENT_ONLY_CATEGORIES.includes(category));
}

/** The smallest park that counts towards the park need: 0.5 ha. */
export const PARK_MIN_AREA_M2 = 5000;

/**
 * The distance written for a need the city has no place for. It is a real
 * value rather than a gap, and lies outside every walking band.
 */
export const NONE_FOUND_METRES = 65535;
