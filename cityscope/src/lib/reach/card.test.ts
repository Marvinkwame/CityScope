import { describe, it, expect } from 'vitest';
import { cardIsStale, cardRequestable, cardRows, cellCentre, healKey, linkLines, shouldHeal } from './card';
import { missingCount } from './expressions';
import { NEED_IDS, NONE_FOUND_METRES, REACH_MINUTES } from './model';
import type { CellCard, NeedId, ReachPayload, ReachProperties } from './model';

// The payload's block, at k 68.5 straight-line metres a minute.
const PROPS: ReachProperties = {
  h: '891f1d4a99bffff',
  r: 420,
  sm: 380,
  ph: 1050,
  dr: NONE_FOUND_METRES,
  sc: 1020,
  pk: 120,
  st: 40,
};

// The endpoint's card for the same block, matching the payload. Every found
// place has coordinates, so the link-line tests can reuse it.
const CARD: CellCard = {
  cell: '891f1d4a99bffff',
  residents: 420,
  metresPerMinute: 68.5,
  needs: [
    { need: 'sm', name: 'La Vie Claire', category: 'supermarket', lng: 13.4061, lat: 52.5219, metres: 380, minutes: 6 },
    { need: 'ph', name: 'Rathaus-Apotheke', category: 'pharmacy', lng: 13.4127, lat: 52.5174, metres: 1050, minutes: 16 },
    { need: 'dr', name: null, category: null, lng: null, lat: null, metres: null, minutes: null },
    { need: 'sc', name: 'Evangelisches Gymnasium zum Grauen Kloster', category: 'school', lng: 13.3912, lat: 52.5257, metres: 1020, minutes: 15 },
    { need: 'pk', name: null, category: 'park', lng: 13.4049, lat: 52.5197, metres: 120, minutes: 2 },
    { need: 'st', name: 'Spandauer Straße/Marienkirche', category: 'tram_stop', lng: 13.4038, lat: 52.5206, metres: 40, minutes: 1 },
  ],
};

function withWalk(card: CellCard, need: NeedId, walk: [number, number][] | null): CellCard {
  return { ...card, needs: card.needs.map((n) => (n.need === need ? { ...n, walk } : n)) };
}

describe('linkLines walks', () => {
  it('draws the walk along the streets when the card has one', () => {
    const walk: [number, number][] = [[13.4, 52.5], [13.401, 52.5003], [13.402, 52.5007]];
    const card = withWalk(CARD, 'st', walk);
    const line = linkLines(card, PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features.find((f) => f.properties!.need === 'st')!;
    expect(line.geometry.coordinates).toEqual(walk);
  });

  it('draws the straight line for a card with no walk, including one cached before walks existed', () => {
    // The CARD fixture predates walks: its needs have no `walk` key at all.
    const line = linkLines(CARD, PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features[0];
    expect(line.geometry.coordinates[0]).toEqual([13.4, 52.5]);
    expect(line.geometry.coordinates).toHaveLength(2);
    const nullWalk = linkLines(withWalk(CARD, 'pk', null), PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features[0];
    expect(nullWalk.geometry.coordinates).toHaveLength(2);
  });
});

describe('cardRows', () => {
  it('marks chosen needs within or outside the limit from the payload, and leaves unchosen ones unmarked', () => {
    expect(cardRows(CARD, PROPS, 68.5, 15, ['sm', 'ph', 'dr', 'pk']).map((r) => [r.need, r.within])).toEqual([
      ['sm', true],
      ['ph', false],
      ['dr', false],
      ['sc', null],
      ['pk', true],
      ['st', null],
    ]);
  });

  it('shows rounded-up minutes from the payload', () => {
    expect(cardRows(CARD, PROPS, 68.5, 15, NEED_IDS).map((r) => r.minutesText)).toEqual([
      '~6 min',
      '~16 min',
      '—',
      '~15 min',
      '~2 min',
      '~1 min',
    ]);
  });

  it('names unnamed places by category and missing places plainly', () => {
    const rows = cardRows(CARD, PROPS, 68.5, 15, NEED_IDS);
    expect(rows.find((r) => r.need === 'pk')!.name).toBe('Unnamed park');
    expect(rows.find((r) => r.need === 'st')!.name).toBe('Spandauer Straße/Marienkirche');
    expect(rows.find((r) => r.need === 'dr')).toMatchObject({ name: 'None in the data', minutesText: '—', place: null });
  });

  it("labels each row by its need and uses the place's own icon", () => {
    const rows = cardRows(CARD, PROPS, 68.5, 15, ['sm']);
    expect(rows.map((r) => r.label)).toEqual(['Supermarket', 'Pharmacy', 'Doctor', 'School', 'Park', 'Station']);
    expect(rows.find((r) => r.need === 'st')).toMatchObject({ iconCategory: 'tram_stop', place: { lng: 13.4038, lat: 52.5206 } });
    expect(rows.find((r) => r.need === 'dr')!.iconCategory).toBe('doctors');
    expect(rows.map((r) => r.chosen)).toEqual([true, false, false, false, false, false]);
  });

  it('gives minutes and marks from the payload alone while the card loads', () => {
    const rows = cardRows(undefined, PROPS, 68.5, 15, NEED_IDS);
    expect(rows.map((r) => r.within)).toEqual([true, false, false, true, true, true]);
    expect(rows.map((r) => r.minutesText)).toEqual(['~6 min', '~16 min', '—', '~15 min', '~2 min', '~1 min']);
    expect(rows.find((r) => r.need === 'st')).toMatchObject({ name: '', iconCategory: 'station', place: null });
  });
});

describe('the card and the block colour agree', () => {
  // The fixture block, one with places exactly on and just past the 10-minute
  // limit at k 68.5 (685 m), and one with no doctor or station at all.
  const BLOCKS: ReachProperties[] = [
    PROPS,
    { ...PROPS, h: 'edge', sm: 685, ph: 686, dr: 684, sc: 1370, pk: 1371, st: 0 },
    { ...PROPS, h: 'bare', dr: NONE_FOUND_METRES, st: NONE_FOUND_METRES, sc: 2000 },
  ];
  const NEED_SETS: readonly (readonly NeedId[])[] = [NEED_IDS, ['sm'], ['dr'], ['sm', 'ph'], ['sc', 'pk', 'st'], ['ph', 'dr', 'sc', 'pk']];

  it("marks as many chosen needs ✗ as the block's class counts missing, at every time and for every need set", () => {
    for (const props of BLOCKS)
      for (const minutes of REACH_MINUTES)
        for (const chosen of NEED_SETS)
          for (const card of [CARD, undefined]) {
            const crosses = cardRows(card, props, 68.5, minutes, chosen).filter((r) => r.chosen && r.within === false).length;
            expect(crosses, `${props.h} at ${minutes} min for ${chosen.join(',')}`).toBe(missingCount(props, chosen, minutes, 68.5));
          }
  });
});

describe('cardIsStale', () => {
  it('follows the payload and flags a card from newer data', () => {
    expect(cardIsStale(CARD, PROPS, 68.5)).toBe(false);
    const newer = { ...CARD, needs: CARD.needs.map((n) => (n.need === 'ph' ? { ...n, metres: 900 } : n)) };
    expect(cardIsStale(newer, PROPS, 68.5)).toBe(true);
    expect(cardRows(newer, PROPS, 68.5, 15, NEED_IDS).find((r) => r.need === 'ph')!.within).toBe(false);
    expect(cardIsStale({ ...CARD, metresPerMinute: 70 }, PROPS, 68.5)).toBe(true);
  });

  it('flags a place found where the payload had none, and one lost since', () => {
    const found = { ...CARD, needs: CARD.needs.map((n) => (n.need === 'dr' ? { ...n, metres: 700 } : n)) };
    expect(cardIsStale(found, PROPS, 68.5)).toBe(true);
    const lost = { ...CARD, needs: CARD.needs.map((n) => (n.need === 'pk' ? { ...n, metres: null } : n)) };
    expect(cardIsStale(lost, PROPS, 68.5)).toBe(true);
  });
});

describe('cellCentre', () => {
  it('finds the centre of a closed hexagon ring', () => {
    expect(cellCentre([[0, 0], [2, 0], [3, 1], [2, 2], [0, 2], [-1, 1], [0, 0]])).toEqual([1, 1]);
  });
});

describe('linkLines', () => {
  it('draws lines only to chosen places within the limit', () => {
    expect(linkLines(CARD, PROPS, 68.5, 5, NEED_IDS, [13.4, 52.5]).features.map((f) => f.properties!.need)).toEqual(['pk', 'st']);
    expect(linkLines(CARD, PROPS, 68.5, 5, ['sm', 'st'], [13.4, 52.5]).features.map((f) => f.properties!.need)).toEqual(['st']);
  });
  it('draws no lines from a card that is newer than the payload', () => {
    expect(linkLines({ ...CARD, metresPerMinute: 70 }, PROPS, 68.5, 15, NEED_IDS, [13.4, 52.5]).features).toEqual([]);
  });
});

describe('cardRequestable', () => {
  const PAYLOAD = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: PROPS }],
  } as unknown as ReachPayload;

  it('is false when reach is off', () => {
    expect(cardRequestable(false, PROPS.h, PAYLOAD)).toBe(false);
  });
  it('is false when no block is selected', () => {
    expect(cardRequestable(true, null, PAYLOAD)).toBe(false);
  });
  it('is false while there is no payload', () => {
    expect(cardRequestable(true, PROPS.h, undefined)).toBe(false);
  });
  it("is false when the block isn't in the payload (the old city's block)", () => {
    expect(cardRequestable(true, '891f18845dbffff', PAYLOAD)).toBe(false);
  });
  it('is true when the block is in the payload', () => {
    expect(cardRequestable(true, PROPS.h, PAYLOAD)).toBe(true);
  });
});

describe('healKey and shouldHeal', () => {
  const at = (builtAt: string) =>
    ({ meta: { city: 'berlin', builtAt } }) as unknown as ReachPayload;

  it('healKey changes when the payload is rebuilt', () => {
    expect(healKey(at('a'), 'c1')).toBe('berlin|a|c1');
    expect(healKey(at('a'), 'c1')).not.toBe(healKey(at('b'), 'c1'));
  });

  it('heals a stale card once per key', () => {
    const k = 'berlin|a|c1';
    expect(shouldHeal(new Set([k]), k, true)).toBe(false);
    expect(shouldHeal(new Set(), k, false)).toBe(false);
    expect(shouldHeal(new Set(), k, true)).toBe(true);
  });
});
