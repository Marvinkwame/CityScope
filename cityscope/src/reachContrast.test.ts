import { describe, expect, it } from 'vitest';
import { REACH_CLASS, REACH_FILL_OPACITY, REACH_SELECTION, SURFACE } from './theme';

type Rgb = [number, number, number];

function parse(c: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb;
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map(Math.round) as Rgb;
  throw new Error(`unparseable colour ${c}`);
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour at the flat fill's layer opacity over the land tint (straight alpha, 8-bit sRGB). */
const flat = (c: string): Rgb => {
  const fg = parse(c);
  const bg = parse(SURFACE.land);
  return fg.map((v, i) => Math.round(v * REACH_FILL_OPACITY + bg[i] * (1 - REACH_FILL_OPACITY))) as Rgb;
};
const solid = (c: string): Rgb => parse(c);

describe('reach class contrast', () => {
  it('keeps neighbouring classes at least 2:1 apart in the flat fill', () => {
    expect(contrast(flat(REACH_CLASS.allMet), flat(REACH_CLASS.oneMissing))).toBeGreaterThanOrEqual(2);
    expect(contrast(flat(REACH_CLASS.oneMissing), flat(REACH_CLASS.twoPlusMissing))).toBeGreaterThanOrEqual(2);
  });

  it('keeps neighbouring classes at least 2:1 apart as solid 3D columns', () => {
    expect(contrast(solid(REACH_CLASS.allMet), solid(REACH_CLASS.oneMissing))).toBeGreaterThanOrEqual(2);
    expect(contrast(solid(REACH_CLASS.oneMissing), solid(REACH_CLASS.twoPlusMissing))).toBeGreaterThanOrEqual(2);
  });

  it('keeps the selection casing at least 3:1 from the strongest class', () => {
    expect(contrast(solid(REACH_SELECTION.casing), flat(REACH_CLASS.allMet))).toBeGreaterThanOrEqual(3);
  });

  // Most blocks at 5 minutes are in the darkest class, so it must still read as
  // filled rather than as bare land.
  it('keeps the darkest class at least 1.5:1 from the land in the flat fill', () => {
    expect(contrast(flat(REACH_CLASS.twoPlusMissing), solid(SURFACE.land))).toBeGreaterThanOrEqual(1.5);
  });
});
