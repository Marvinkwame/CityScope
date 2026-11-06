/** The everyday reach panel's text and figures, kept pure so every word is tested. */

import { formatCount } from '../../components/results/format';
import type { BarRowView } from '../../components/results/bars';
import type { ReachAvailability } from './api';
import { NEED_IDS, REACH_NEEDS } from './model';
import type { NeedId, ReachMeta } from './model';

/**
 * A share (0..1) as a percentage. Only exactly 0 and 1 read "0%" and "100%":
 * a real share below 0.5% reads "<1%", and one from 99.5% up keeps a decimal,
 * rounded down, so it can never round up to 100%.
 */
export function percent(share: number): string {
  if (share === 0 || share === 1) return `${share * 100}%`;
  if (share > 0 && share < 0.005) return '<1%';
  if (share >= 0.995 && share < 1) {
    // The epsilon stops 0.995 * 1000 landing a hair under 995; the cap keeps a
    // share a hair under 1 from reaching 100.0%.
    const tenths = Math.min(999, Math.floor(share * 1000 + 1e-9));
    return `${(tenths / 10).toFixed(1)}%`;
  }
  return `${Math.round(share * 100)}%`;
}

/** 3,624,966 -> "3.6 M"; 888,663 -> "889,000". */
export function formatResidents(n: number): string {
  const thousands = Math.round(n / 1000) * 1000;
  if (thousands >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  return formatCount(thousands);
}

/** 62.5 -> "62.5", 57 -> "57": one decimal, only when there is one. */
export function upToOneDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "Berlin · whole city · 3.6 M estimated residents". */
export function coverageLine(meta: Pick<ReachMeta, 'cityName' | 'coverage' | 'residents'>): string {
  return `${meta.cityName} · ${meta.coverage} · ${formatResidents(meta.residents)} estimated residents`;
}

const COUNT_WORDS: Readonly<Record<number, string>> = { 3: 'three', 4: 'four', 5: 'five' };

function needLabel(id: NeedId): string {
  return REACH_NEEDS.find((n) => n.id === id)?.label ?? id;
}

/** The words after the headline figure, for the chosen needs and time. */
export function headlineSentence(needs: readonly NeedId[], minutes: number): string {
  const lead = `of residents live within ${minutes} minutes' walk of`;
  if (needs.length >= NEED_IDS.length) return `${lead} all six everyday needs`;
  if (needs.length === 1) return `${lead} a ${needLabel(needs[0]).toLowerCase()}`;
  if (needs.length === 2) return `${lead} both chosen needs`;
  return `${lead} all ${COUNT_WORDS[needs.length] ?? needs.length} chosen needs`;
}

const WHOLE_PERCENT = /^\d+%$/;

/**
 * "range 62–72%", or with each end in full when either isn't a plain whole
 * percent. When both ends read the same, says so rather than "range 92–92%".
 */
export function rangeLine(low: number, high: number): string {
  const lo = percent(low);
  const hi = percent(high);
  if (lo === hi) return 'no change across the pace range';
  if (WHOLE_PERCENT.test(lo) && WHOLE_PERCENT.test(hi)) return `range ${lo.slice(0, -1)}–${hi}`;
  return `range ${lo}–${hi}`;
}

/** The one line under the range that says where it comes from. */
export function rangeExplanation(kLow: number, kHigh: number): string {
  return (
    `How far the figure moves if walking pace is anywhere from ${upToOneDecimal(kLow)} to ` +
    `${upToOneDecimal(kHigh)} straight-line metres a minute: the calibration's uncertainty.`
  );
}

/** "97% (always answering 'within' scores 94%)", or "97%" without a base rate. */
export function agreementLine(agreement: number, alwaysWithin: number | undefined): string {
  const figure = percent(agreement);
  return alwaysWithin === undefined ? figure : `${figure} (always answering 'within' scores ${percent(alwaysWithin)})`;
}

/** Why the switch is disabled, or null when it isn't. */
export function switchCaption(a: ReachAvailability): string | null {
  if (a === 'not-built') return 'Not built for this city yet';
  if (a === 'not-reliable') return 'Estimate not reliable here yet';
  return null;
}

/** All six needs as bars, in display order; the unchosen ones dimmed. */
export function needBarRows(perNeed: Record<NeedId, number>, selected: readonly NeedId[]): BarRowView[] {
  return REACH_NEEDS.map(({ id, label, iconCategory }) => {
    const share = perNeed[id];
    const value = percent(share);
    const chosen = selected.includes(id);
    return {
      key: id,
      iconCategory,
      label,
      value,
      barPct: share * 100,
      srLabel: `${label}: ${value} of residents${chosen ? '' : ', not chosen'}`,
      dimmed: !chosen,
    };
  });
}

/** London's check of OSM doctors against the NHS list of GP practices. */
export function gpCheckLine(share: number, practices: number): string {
  return (
    `${percent(share)} of ${formatCount(practices)} NHS GP practices have an OpenStreetMap doctor or clinic ` +
    'within 150 m, so distances to a doctor may be overstated'
  );
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** An ISO timestamp as its UTC day, e.g. "20 Oct 2026"; one it can't read comes back unchanged. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  // An invalid date would make format() throw, and nothing above would catch it.
  return Number.isNaN(date.getTime()) ? iso : DAY.format(date);
}
