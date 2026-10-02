import { formatCount } from './format';

export interface Comparison {
  /** ▲ above, ▼ below, ≈ about the same. The arrow carries the direction; colour never does. */
  arrow: '▲' | '▼' | '≈';
  /** "+142%" or "−62%", or null when there is nothing to quantify. */
  delta: string | null;
  /** The muted half of the badge: "vs city avg 35/km²", or "city average". */
  context: string;
  /** The whole comparison as a sentence, for screen readers. */
  label: string;
}

/**
 * How an area's density compares with the city's average district. `pct` is
 * the API's `densityVsCityPct`: null when no meaningful comparison exists.
 * Density is neither good nor bad, so there is no "better" or "worse" here,
 * only above and below. Anything that rounds to 0% reads as average.
 */
export function compareToCity(pct: number | null, cityAvgDensity: number): Comparison {
  const rounded = pct === null ? 0 : Math.round(pct);
  if (rounded === 0) {
    return { arrow: '≈', delta: null, context: 'city average', label: 'About the city average density' };
  }

  const size = Math.abs(rounded);
  const avg = formatCount(cityAvgDensity);
  const context = `vs city avg ${avg}/km²`;

  if (rounded > 0) {
    return { arrow: '▲', delta: `+${size}%`, context, label: `${size}% above the city average of ${avg} per km²` };
  }
  return { arrow: '▼', delta: `−${size}%`, context, label: `${size}% below the city average of ${avg} per km²` };
}
