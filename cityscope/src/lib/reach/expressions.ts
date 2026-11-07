import type { ExpressionSpecification } from 'mapbox-gl';
import { REACH_CLASS, REACH_SELECTION } from '../../theme';
import { REACH_EXTRUSION_M_PER_RESIDENT } from './config';
import type { NeedId, ReachProperties } from './model';
import { isWithin } from './summary';

export type ReachClass = 'allMet' | 'oneMissing' | 'twoPlusMissing';

/** How many of the chosen needs are out of reach within the time limit. */
export function missingCount(props: ReachProperties, needs: readonly NeedId[], minutes: number, k: number): number {
  return needs.filter((id) => !isWithin(props[id], minutes, k)).length;
}

export function classOf(missing: number): ReachClass {
  if (missing <= 0) return 'allMet';
  return missing === 1 ? 'oneMissing' : 'twoPlusMissing';
}

/** The same count as `missingCount`, evaluated by Mapbox from each feature's properties. */
export function missingCountExpression(needs: readonly NeedId[], minutes: number, k: number): ExpressionSpecification {
  const terms = needs.map((id) => ['case', ['<=', ['get', id], minutes * k], 0, 1] as ExpressionSpecification);
  return terms.length === 1 ? terms[0] : (['+', ...terms] as ExpressionSpecification);
}

/** The count read from feature state, so a recolour never touches the paint property. */
export const MISSING_FROM_STATE: ExpressionSpecification = ['coalesce', ['feature-state', 'missing'], 0];

export function reachColourExpression(missing: ExpressionSpecification): ExpressionSpecification {
  return ['step', missing, REACH_CLASS.allMet, 1, REACH_CLASS.oneMissing, 2, REACH_CLASS.twoPlusMissing];
}

/** Like the flat colour, but a selected column is drawn in the you colour. */
export function reachExtrusionColourExpression(missing: ExpressionSpecification): ExpressionSpecification {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    REACH_SELECTION.line,
    reachColourExpression(missing),
  ];
}

export function reachHeightExpression(): ExpressionSpecification {
  return ['*', ['get', 'r'], REACH_EXTRUSION_M_PER_RESIDENT];
}

/** With one need at most one can be missing, so only two classes can appear. */
export function reachLegend(needCount: number): ReadonlyArray<{ cls: ReachClass; label: string; colour: string }> {
  if (needCount <= 1) {
    return [
      { cls: 'allMet', label: 'Met', colour: REACH_CLASS.allMet },
      { cls: 'oneMissing', label: 'Not met', colour: REACH_CLASS.oneMissing },
    ];
  }
  return [
    { cls: 'allMet', label: 'All met', colour: REACH_CLASS.allMet },
    { cls: 'oneMissing', label: 'One missing', colour: REACH_CLASS.oneMissing },
    { cls: 'twoPlusMissing', label: 'Two or more missing', colour: REACH_CLASS.twoPlusMissing },
  ];
}
