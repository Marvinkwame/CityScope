import { categoryLabel, formatCount, formatShare } from './format';

export interface CategoryCount {
  category: string;
  count: number;
}

/** Either shape the API returns: a list of counts, or a category -> count record. */
export type CategoryCounts = ReadonlyArray<CategoryCount> | Readonly<Record<string, number>>;

export interface BarRow {
  category: string;
  count: number;
  /** count / total, 0..1: this category's share of every place in the area. */
  share: number;
  /** count / the largest count, 0..100: the bar's width. */
  barPct: number;
}

export interface Bars {
  rows: BarRow[];
  /** How many categories did not make the top `limit`. */
  moreCount: number;
}

function isList(counts: CategoryCounts): counts is ReadonlyArray<CategoryCount> {
  return Array.isArray(counts);
}

/**
 * The top `limit` categories as bar rows, largest first (ties alphabetical,
 * so the order is stable), plus how many categories were left out. Zero
 * counts are dropped.
 */
export function toBars(counts: CategoryCounts, total: number, limit = 5): Bars {
  const entries = (isList(counts)
    ? counts.map(({ category, count }) => ({ category, count }))
    : Object.entries(counts).map(([category, count]) => ({ category, count })))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const top = entries.slice(0, limit);
  const largest = top[0]?.count ?? 0;

  return {
    rows: top.map(({ category, count }) => ({
      category,
      count,
      share: total > 0 ? count / total : 0,
      barPct: largest > 0 ? (count / largest) * 100 : 0,
    })),
    moreCount: entries.length - top.length,
  };
}

/** What a screen reader hears for one row, e.g. "Restaurant: 924, 28%". */
export function barLabel(row: BarRow): string {
  return `${categoryLabel(row.category)}: ${formatCount(row.count)}, ${formatShare(row.share)}`;
}
