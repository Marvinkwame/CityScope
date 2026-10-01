import { describe, it, expect } from 'vitest';
import { AMBER, CYAN, ROLE, HEAT_RAMP, heatmapColorExpression, heatRampGradientCss } from './theme';

const alphaOf = (colour: string): number => {
  const parts = colour.slice(colour.indexOf('(') + 1, -1).split(',').map((p) => p.trim());
  return parts.length === 4 ? Number(parts[3]) : 1;
};

describe('colour roles', () => {
  it('maps the roles onto the two theme accents', () => {
    expect(ROLE.you).toBe(AMBER);
    expect(ROLE.answer).toBe(CYAN);
  });
});

describe('HEAT_RAMP', () => {
  it('runs from density 0 to 1 in increasing order', () => {
    const densities = HEAT_RAMP.map(([d]) => d);
    expect(densities[0]).toBe(0);
    expect(densities[densities.length - 1]).toBe(1);
    densities.slice(1).forEach((d, i) => expect(d).toBeGreaterThan(densities[i]));
  });

  // The point of replacing the rainbow: more density must always look like more.
  it('never gets less opaque as density rises', () => {
    const alphas = HEAT_RAMP.map(([, c]) => alphaOf(c));
    alphas.slice(1).forEach((a, i) => expect(a).toBeGreaterThanOrEqual(alphas[i]));
  });

  it('uses a single hue', () => {
    const hues = new Set(HEAT_RAMP.map(([, c]) => c.slice(c.indexOf('(') + 1).split(',').slice(0, 3).join(',')));
    expect(hues.size).toBe(1);
  });

  // Nothing else ties the ramp's hand-written rgba strings to the role colour.
  it('uses the context role colour', () => {
    const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const expected = rgbOf(ROLE.context);
    for (const [, colour] of HEAT_RAMP) {
      const rgb = colour.slice(colour.indexOf('(') + 1, -1).split(',').slice(0, 3).map(Number);
      expect(rgb).toEqual(expected);
    }
  });
});

describe('ramp builders', () => {
  it('builds a Mapbox interpolate expression from the ramp stops', () => {
    expect(heatmapColorExpression()).toEqual([
      'interpolate', ['linear'], ['heatmap-density'],
      ...HEAT_RAMP.flat(),
    ]);
  });

  it('builds a CSS gradient listing every stop colour at its position, in order', () => {
    const css = heatRampGradientCss();
    expect(css.startsWith('linear-gradient(to right, ')).toBe(true);
    const stops = [...css.matchAll(/(rgba\([^)]*\)) ([\d.]+)%/g)].map((m) => [m[1], Number(m[2])]);
    expect(stops).toEqual(HEAT_RAMP.map(([density, colour]) => [colour, density * 100]));
  });
});
