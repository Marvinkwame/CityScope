import { describe, expect, it } from 'vitest';
import { REACH_CLASS, ROLE } from '../../theme';
import {
  MISSING_FROM_STATE,
  classOf,
  missingCount,
  missingCountExpression,
  reachColourExpression,
  reachExtrusionColourExpression,
  reachHeightExpression,
  reachLegend,
} from './expressions';
import { NEED_IDS } from './model';
import type { ReachProperties } from './model';

type Val = string | number | boolean | null | readonly Val[];
type State = Record<string, Val>;

/** A small evaluator for the operators the builders use. */
function evaluate(expr: unknown, props: Record<string, Val>, state: State): Val {
  if (!Array.isArray(expr)) return expr as Val;
  const [op, ...args] = expr as unknown[];
  const ev = (e: unknown) => evaluate(e, props, state);
  switch (op) {
    case 'get':
      return props[args[0] as string] ?? null;
    case 'feature-state':
      return state[args[0] as string] ?? null;
    case 'coalesce':
      for (const a of args) {
        const v = ev(a);
        if (v !== null) return v;
      }
      return null;
    case 'boolean':
      for (const a of args) {
        const v = ev(a);
        if (typeof v === 'boolean') return v;
      }
      return null;
    case 'case': {
      for (let i = 0; i + 1 < args.length; i += 2) if (ev(args[i]) === true) return ev(args[i + 1]);
      return ev(args[args.length - 1]);
    }
    case '<=':
      return (ev(args[0]) as number) <= (ev(args[1]) as number);
    case '+':
      return args.reduce<number>((s, a) => s + (ev(a) as number), 0);
    case '*':
      return args.reduce<number>((s, a) => s * (ev(a) as number), 1);
    case 'step': {
      const input = ev(args[0]) as number;
      let out = ev(args[1]);
      for (let i = 2; i + 1 < args.length; i += 2) if (input >= (ev(args[i]) as number)) out = ev(args[i + 1]);
      return out;
    }
    default:
      throw new Error(`unsupported operator ${String(op)}`);
  }
}

const A: ReachProperties = { h: 'a', r: 100, sm: 100, ph: 200, dr: 300, sc: 400, pk: 500, st: 600 };
const FIXTURE_PROPS: ReachProperties[] = [
  A,
  { ...A, h: 'b', sm: 5000 },
  { ...A, h: 'c', sm: 5000, st: 65535 },
  { ...A, h: 'd', pk: 65535, st: 65535, sc: 9000 },
  { ...A, h: 'e', r: 0, sm: 665, ph: 666, dr: 667 },
];

describe('reach expressions', () => {
  it('builds a single-need expression without a sum', () => {
    expect(missingCountExpression(['ph'], 15, 62.5)).toEqual(['case', ['<=', ['get', 'ph'], 937.5], 0, 1]);
  });

  it('colours every fixture block exactly as classOf(missingCount) does, from properties or from state', () => {
    for (const needs of [NEED_IDS, ['sm', 'st'], ['pk']] as const)
      for (const props of FIXTURE_PROPS) {
        const want = REACH_CLASS[classOf(missingCount(props, needs, 10, 66.5))];
        expect(evaluate(reachColourExpression(missingCountExpression(needs, 10, 66.5)), props, {})).toBe(want);
        expect(
          evaluate(reachColourExpression(MISSING_FROM_STATE), props, {
            missing: missingCount(props, needs, 10, 66.5),
          }),
        ).toBe(want);
      }
  });

  it('draws a column in the you colour only while it is selected', () => {
    const expr = reachExtrusionColourExpression(MISSING_FROM_STATE);
    expect(evaluate(expr, A, { selected: true })).toBe(ROLE.you);
    expect(evaluate(expr, A, {})).toBe(REACH_CLASS.allMet);
  });

  it('treats a none-found distance as missing', () => {
    expect(missingCount({ ...A, pk: 65535 }, NEED_IDS, 20, 70)).toBe(1);
  });

  it('classes 0, 1 and 2 or more', () => {
    expect([0, 1, 2, 6].map(classOf)).toEqual(['allMet', 'oneMissing', 'twoPlusMissing', 'twoPlusMissing']);
  });

  it('scales the height by residents', () => {
    expect(evaluate(reachHeightExpression(), { r: 250 }, {})).toBeCloseTo(25);
  });

  it('labels the legend for one need as met and not met', () => {
    expect(reachLegend(1).map((r) => r.label)).toEqual(['Met', 'Not met']);
    expect(reachLegend(6).map((r) => r.cls)).toEqual(['allMet', 'oneMissing', 'twoPlusMissing']);
  });
});
