import { describe, it, expect } from 'vitest';
import { ANSWER_LAYER_IDS, answerBeforeId, contextBeforeId, reachBeforeId } from './layerOrder';
import {
  DISTRICT_FILL_LAYER_ID,
  DISTRICT_LINE_LAYER_ID,
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  REACH_EXTRUSION_LAYER_ID,
  REACH_FILL_LAYER_ID,
  REACH_LINKS_CASING_LAYER_ID,
  REACH_LINKS_LAYER_ID,
  ROUTE_LAYER_ID,
} from '../constants/layerConfig';

const background = { id: 'background', type: 'background' };
const road = { id: 'road-primary', type: 'line' };
const label = { id: 'road-label', type: 'symbol' };
const placeLabel = { id: 'place-label', type: 'symbol' };

describe('layer order', () => {
  it('puts both roles before the first label when there are no answer layers', () => {
    const layers = [background, road, label, placeLabel];
    expect(answerBeforeId(layers)).toBe('road-label');
    expect(contextBeforeId(layers)).toBe('road-label');
  });

  it('puts context before the isochrone when one is on the map', () => {
    const layers = [
      background,
      road,
      { id: ISOCHRONE_FILL_LAYER_ID, type: 'fill' },
      { id: ISOCHRONE_LINE_LAYER_ID, type: 'line' },
      label,
    ];
    expect(contextBeforeId(layers)).toBe(ISOCHRONE_FILL_LAYER_ID);
    expect(answerBeforeId(layers)).toBe('road-label');
  });

  it('puts context before the route when only the route is on the map', () => {
    const layers = [background, road, { id: ROUTE_LAYER_ID, type: 'line' }, label];
    expect(contextBeforeId(layers)).toBe(ROUTE_LAYER_ID);
  });

  it('appends on top when the style has no label layers', () => {
    const layers = [background, road];
    expect(answerBeforeId(layers)).toBeUndefined();
    expect(contextBeforeId(layers)).toBeUndefined();
  });
});

describe('everyday reach layer order', () => {
  it('puts the reach fill beneath the district outlines', () => {
    expect(
      reachBeforeId([
        background,
        road,
        { id: DISTRICT_FILL_LAYER_ID, type: 'fill' },
        { id: DISTRICT_LINE_LAYER_ID, type: 'line' },
        label,
      ]),
    ).toBe(DISTRICT_FILL_LAYER_ID);
  });

  it('puts district layers added later above the reach fill', () => {
    expect(contextBeforeId([background, road, { id: REACH_FILL_LAYER_ID, type: 'fill' }, label])).toBe('road-label');
  });

  it('puts the reach fill beneath an isochrone', () => {
    expect(reachBeforeId([background, road, { id: ISOCHRONE_FILL_LAYER_ID, type: 'fill' }, label])).toBe(
      ISOCHRONE_FILL_LAYER_ID,
    );
  });

  it('counts the lines to nearest places as an answer, but not the reach fill or columns', () => {
    expect(ANSWER_LAYER_IDS).toContain(REACH_LINKS_LAYER_ID);
    expect(ANSWER_LAYER_IDS).not.toContain(REACH_FILL_LAYER_ID);
    expect(ANSWER_LAYER_IDS).not.toContain(REACH_EXTRUSION_LAYER_ID);
  });

  it('counts the walk casing as an answer, listed before the walk it sits under', () => {
    expect(ANSWER_LAYER_IDS).toContain(REACH_LINKS_CASING_LAYER_ID);
    expect(ANSWER_LAYER_IDS.indexOf(REACH_LINKS_CASING_LAYER_ID)).toBeLessThan(
      ANSWER_LAYER_IDS.indexOf(REACH_LINKS_LAYER_ID),
    );
  });

  it('puts context added later beneath the walk casing', () => {
    const casing = { id: REACH_LINKS_CASING_LAYER_ID, type: 'line' };
    const walk = { id: REACH_LINKS_LAYER_ID, type: 'line' };
    expect(contextBeforeId([background, road, casing, walk, label])).toBe(REACH_LINKS_CASING_LAYER_ID);
  });
});
