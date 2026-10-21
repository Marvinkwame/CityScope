/**
 * Number formatting for the result panels. The locale is fixed to en-US so
 * the numbers read the same on every machine.
 */
const COUNT = new Intl.NumberFormat('en-US');

/** 3350 -> "3,350". Rounds to a whole number first. */
export function formatCount(n: number): string {
  return COUNT.format(Math.round(n));
}

/**
 * A fraction of a whole (0..1) as a percentage: 0.2757 -> "28%". A real share
 * too small to round up to 1% reads "<1%", never "0%".
 */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
}

/** Metres below 1 km, kilometres with one decimal from 1 km up. */
export function distanceParts(metres: number): { value: string; unit: 'm' | 'km' } {
  const rounded = Math.round(metres);
  if (rounded < 1000) return { value: String(rounded), unit: 'm' };
  return { value: (metres / 1000).toFixed(1), unit: 'km' };
}

/** "120 m" / "1.4 km". */
export function formatDistance(metres: number): string {
  const { value, unit } = distanceParts(metres);
  return `${value} ${unit}`;
}

/** Categories whose plain capitalised name reads wrongly as a label. */
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  doctors: 'Doctor',
  halt: 'Rail halt',
};

/** "restaurant" -> "Restaurant"; "doctors" -> "Doctor". */
export function categoryLabel(category: string): string {
  return LABEL_OVERRIDES[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}
