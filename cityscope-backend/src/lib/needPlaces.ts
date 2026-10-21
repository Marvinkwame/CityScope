/**
 * How many places a city has for a need, asked before the nearest-place search.
 *
 * The search orders every cell's candidates by distance on the geography index
 * and keeps the first that matches the city and the need. When the city has no
 * such place at all, nothing ever matches and each cell walks the whole index,
 * so build-reach counts first and skips a need with none (its cells then read
 * as the none-found distance).
 */

import { PARK_MIN_AREA_M2 } from './needs.js';
import type { Need } from './needs.js';

const POI_COUNT_SQL = `
  SELECT count(*)::int AS places
  FROM pois
  WHERE city_id = $1 AND category = ANY($2::text[])
`;

const PARK_COUNT_SQL = `
  SELECT count(*)::int AS places
  FROM parks
  WHERE city_id = $1 AND area_m2 >= $2
`;

/**
 * The statement counting the places the nearest-place search for `need` could
 * find in the city: its POI categories, or the parks of the minimum area.
 */
export function placeCountQuery(need: Need, cityId: string): { text: string; values: unknown[] } {
  return need.source === 'parks'
    ? { text: PARK_COUNT_SQL, values: [cityId, PARK_MIN_AREA_M2] }
    : { text: POI_COUNT_SQL, values: [cityId, [...need.categories]] };
}
