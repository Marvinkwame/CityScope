import { describe, it, expect } from 'vitest';
import {
  agreementLine,
  coverageLine,
  formatDate,
  formatResidents,
  gpCheckLine,
  headlineSentence,
  needBarRows,
  percent,
  rangeExplanation,
  rangeLine,
  switchCaption,
  upToOneDecimal,
} from './copy';
import { NEED_IDS } from './model';

describe('percent', () => {
  it('never rounds a share that is not exactly 0 or 1 to 0% or 100%', () => {
    expect([0, 0.003, 0.674, 0.9944, 0.9993, 1].map(percent)).toEqual(['0%', '<1%', '67%', '99%', '99.9%', '100%']);
  });

  it('rounds down near 100%, so a share just under 1 never reads 100.0%', () => {
    expect(percent(0.995)).toBe('99.5%');
    expect(percent(1 - 1e-12)).toBe('99.9%');
  });
});

describe('formatResidents', () => {
  it('formats residents in millions or rounded thousands', () => {
    expect(formatResidents(3624966)).toBe('3.6 M');
    expect(formatResidents(888663)).toBe('889,000');
    expect(formatResidents(282756)).toBe('283,000');
  });
});

describe('coverageLine', () => {
  it('builds the coverage line', () => {
    expect(coverageLine({ cityName: 'Tokyo', coverage: 'the 23 wards', residents: 9059277 })).toBe('Tokyo · the 23 wards · 9.1 M estimated residents');
  });
});

describe('headlineSentence', () => {
  it('words the headline for six, one and some needs', () => {
    expect(headlineSentence(NEED_IDS, 15)).toBe("of residents live within 15 minutes' walk of all six everyday needs");
    expect(headlineSentence(['ph'], 10)).toBe("of residents live within 10 minutes' walk of a pharmacy");
    expect(headlineSentence(['sm', 'pk', 'st'], 20)).toBe("of residents live within 20 minutes' walk of all three chosen needs");
  });

  it('counts two chosen needs in words', () => {
    expect(headlineSentence(['sm', 'ph'], 5)).toBe("of residents live within 5 minutes' walk of both chosen needs");
  });
});

describe('rangeLine', () => {
  it('writes the range as whole percentages, and with decimals near 100%', () => {
    expect(rangeLine(0.6199, 0.7204)).toBe('range 62–72%');
    expect(rangeLine(0.9941, 0.9993)).toBe('range 99%–99.9%');
  });
});

describe('rangeExplanation', () => {
  it('names the pace range behind the figure', () => {
    expect(rangeExplanation(57, 68)).toBe(
      "How far the figure moves if walking pace is anywhere from 57 to 68 straight-line metres a minute: the calibration's uncertainty.",
    );
    expect(rangeExplanation(59.5, 70)).toContain('from 59.5 to 70 straight-line');
  });
});

describe('upToOneDecimal', () => {
  it('keeps one decimal only when there is one', () => {
    expect([62.5, 57, 10.2, 29.04].map(upToOneDecimal)).toEqual(['62.5', '57', '10.2', '29']);
  });
});

describe('agreementLine', () => {
  it('shows agreement beside the base rate', () => {
    expect(agreementLine(0.9722, 0.9389)).toBe("97% (always answering 'within' scores 94%)");
  });

  it('shows agreement alone when there is no base rate', () => {
    expect(agreementLine(0.9722, undefined)).toBe('97%');
  });
});

describe('switchCaption', () => {
  it('captions a disabled switch', () => {
    expect(switchCaption('not-built')).toBe('Not built for this city yet');
    expect(switchCaption('not-reliable')).toBe('Estimate not reliable here yet');
    expect(switchCaption('ready')).toBeNull();
  });
});

describe('needBarRows', () => {
  it('lists all six needs as bars and dims the unchosen ones', () => {
    const rows = needBarRows({ sm: 0.95, ph: 0.86, dr: 0.85, sc: 0.94, pk: 0.97, st: 0.78 }, ['sm', 'st']);
    expect(rows.map((r) => [r.key, r.barPct, r.dimmed ?? false])).toEqual([['sm', 95, false], ['ph', 86, true], ['dr', 85, true], ['sc', 94, true], ['pk', 97, true], ['st', 78, false]]);
  });

  it('labels each bar for screen readers, so the chart is never colour-only', () => {
    const [sm, ph] = needBarRows({ sm: 0.95, ph: 0.86, dr: 0.85, sc: 0.94, pk: 0.97, st: 0.78 }, ['sm']);
    expect([sm.value, sm.srLabel]).toEqual(['95%', 'Supermarket: 95% of residents']);
    expect(ph.srLabel).toBe('Pharmacy: 86% of residents, not chosen');
  });
});

describe('gpCheckLine', () => {
  it("words London's GP check", () => {
    expect(gpCheckLine(0.707, 1142)).toBe(
      '71% of 1,142 NHS GP practices have an OpenStreetMap doctor or clinic within 150 m, so distances to a doctor may be overstated',
    );
  });
});

describe('formatDate', () => {
  it('writes a timestamp as a UTC day', () => {
    expect(formatDate('2026-10-20T23:30:00.000Z')).toBe('20 Oct 2026');
  });
});
