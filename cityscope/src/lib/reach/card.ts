/**
 * The block card's rows. Minutes and marks come from the payload, the numbers
 * the block's colour comes from; only names, categories and positions come
 * from the card endpoint, which can hold newer data than a cached payload.
 */

import { categoryLabel } from '../../components/results/format';
import { NONE_FOUND_METRES, REACH_NEEDS } from './model';
import type { CellCard, CellCardNeed, NeedId, ReachMinutes, ReachProperties } from './model';
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

/** True when the card was built from other data than the payload: another k, or any need's metres. */
export function cardIsStale(card: CellCard, props: ReachProperties, k: number): boolean {
  if (card.metresPerMinute !== k) return true;
  return REACH_NEEDS.some(({ id }) => (cardNeed(card, id)?.metres ?? NONE_FOUND_METRES) !== props[id]);
}
