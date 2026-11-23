/**
 * The block card's rows. Minutes and marks come from the payload, the numbers
 * the block's colour comes from; only names, categories and positions come
 * from the card endpoint, which can hold newer data than a cached payload.
 */

import { categoryLabel } from '../../components/results/format';
import { NONE_FOUND_METRES, REACH_NEEDS } from './model';
import type { CellCard, CellCardNeed, NeedId, ReachMinutes, ReachPayload, ReachProperties } from './model';
import { isWithin } from './summary';

export interface CardRowView {
  need: NeedId;
  label: string;
  iconCategory: string;
  name: string;
  minutesText: string;
  chosen: boolean;
  within: boolean | null;
  place: { lng: number; lat: number } | null;
}

function cardNeed(card: CellCard, need: NeedId): CellCardNeed | undefined {
  return card.needs.find((n) => n.need === need);
}

function placeName(found: CellCardNeed | undefined): string {
  if (found?.name) return found.name;
  if (found?.category) return `Unnamed ${categoryLabel(found.category).toLowerCase()}`;
  return 'None in the data';
}

/**
 * Six rows in need order. A chosen need is marked within the limit or not; an
 * unchosen one is left unmarked (null). While the card is still loading
 * (`card` undefined) every name is empty and no row has a place.
 */
export function cardRows(
  card: CellCard | undefined,
  props: ReachProperties,
  k: number,
  minutes: ReachMinutes,
  chosen: readonly NeedId[],
): CardRowView[] {
  return REACH_NEEDS.map(({ id, label, iconCategory }) => {
    const metres = props[id];
    const found = card ? cardNeed(card, id) : undefined;
    const isChosen = chosen.includes(id);
    return {
      need: id,
      label,
      iconCategory: found?.category ?? iconCategory,
      name: card ? placeName(found) : '',
      minutesText: metres === NONE_FOUND_METRES ? '—' : `~${Math.ceil(metres / k)} min`,
      chosen: isChosen,
      within: isChosen ? isWithin(metres, minutes, k) : null,
      place: found && found.lng !== null && found.lat !== null ? { lng: found.lng, lat: found.lat } : null,
    };
  });
}

/**
 * Whether to ask the endpoint for a block's card: reach is on, a block is
 * selected and the current city's loaded payload lists it. A block from another
 * city (or a stale link) would only 404.
 */
export function cardRequestable(
  enabled: boolean,
  selectedCell: string | null,
  payload: ReachPayload | undefined,
): boolean {
  if (!enabled || selectedCell === null || !payload) return false;
  return payload.features.some((f) => f.properties.h === selectedCell);
}

/** True when the card was built from other data than the payload: another k, or any need's metres. */
export function cardIsStale(card: CellCard, props: ReachProperties, k: number): boolean {
  if (card.metresPerMinute !== k) return true;
  return REACH_NEEDS.some(({ id }) => (cardNeed(card, id)?.metres ?? NONE_FOUND_METRES) !== props[id]);
}

/** One heal per city build and block: the payload's build time stands for its version. */
export function healKey(payload: ReachPayload, cell: string): string {
  return `${payload.meta.city}|${payload.meta.builtAt}|${cell}`;
}

/** Heal a stale card only if this key has not been tried yet. */
export function shouldHeal(attempted: ReadonlySet<string>, key: string, stale: boolean): boolean {
  return stale && !attempted.has(key);
}

/** The mean of a ring's distinct corners (a closed ring repeats its first point, which is dropped). */
export function cellCentre(ring: ReadonlyArray<[number, number]>): [number, number] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && first[0] === last[0] && first[1] === last[1];
  const corners = closed ? ring.slice(0, -1) : ring;
  const sum = corners.reduce<[number, number]>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / corners.length, sum[1] / corners.length];
}

/**
 * Lines from the block's centre to each chosen need's place that is within the
 * limit by the payload. None from a stale card, so a line never points at a
 * place the block's colour didn't count.
 */
export function linkLines(
  card: CellCard,
  props: ReachProperties,
  k: number,
  minutes: ReachMinutes,
  chosen: readonly NeedId[],
  centre: [number, number],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  if (!cardIsStale(card, props, k)) {
    for (const { id } of REACH_NEEDS) {
      if (!chosen.includes(id) || !isWithin(props[id], minutes, k)) continue;
      const found = cardNeed(card, id);
      if (!found || found.lng === null || found.lat === null || found.category === null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: found.walk && found.walk.length >= 2 ? found.walk : [centre, [found.lng, found.lat]] },
        properties: { need: id, category: found.category },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Where a link line's pin sits: the line's last point, which is the place
 * itself, or a park's entry point. Not the second point, which on a street walk
 * is the block's join node.
 */
export function pinPositions(
  links: GeoJSON.FeatureCollection<GeoJSON.LineString>,
): { category: string; lngLat: [number, number] }[] {
  return links.features.map((f) => {
    const end = f.geometry.coordinates[f.geometry.coordinates.length - 1];
    return { category: String(f.properties?.category), lngLat: [end[0], end[1]] };
  });
}
