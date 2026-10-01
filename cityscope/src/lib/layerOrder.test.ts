import { describe, it, expect } from 'vitest';
import { answerBeforeId, contextBeforeId } from './layerOrder';
import {
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
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
