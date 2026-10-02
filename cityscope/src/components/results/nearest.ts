import distance from '@turf/distance';
import type { PlaceItem } from './PlaceList';
import { formatDistance } from './format';

/** Name order for ties: A to Z, and unnamed places after the named ones. */
function compareNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'en-US');
}

/**
 * Places ordered by straight-line distance from `origin`, nearest first, each
 * carrying its distance as `meta` ("120 m"). Ties fall back to name, then id,
 * so the order is stable. Returns a new array and leaves the input alone.
 */
export function nearestFirst(
  places: ReadonlyArray<Omit<PlaceItem, 'meta'>>,
  origin: { lng: number; lat: number },
): PlaceItem[] {
  return places
    .map((place) => ({
      place,
      metres: distance([origin.lng, origin.lat], [place.lng, place.lat], { units: 'kilometers' }) * 1000,
    }))
    .sort(
      (a, b) =>
        a.metres - b.metres ||
        compareNames(a.place.name, b.place.name) ||
        String(a.place.id).localeCompare(String(b.place.id), 'en-US'),
    )
    .map(({ place, metres }) => ({
      id: place.id,
      name: place.name,
      category: place.category,
      lng: place.lng,
      lat: place.lat,
      meta: formatDistance(metres),
    }));
}
