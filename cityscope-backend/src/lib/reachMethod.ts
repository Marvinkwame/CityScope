/** How a city's walking distances were measured: a straight line, or along the street network. */
export type ReachMethod = 'estimate' | 'network';

export function isReachMethod(value: unknown): value is ReachMethod {
  return value === 'estimate' || value === 'network';
}

/** The one method a city's reach_nearest rows were built with; throws on none, a mix, or an unknown one. */
export function methodOfRows(methods: readonly string[]): ReachMethod {
  const distinct = [...new Set(methods)];
  if (distinct.length === 0) {
    throw new Error('The city has no nearest places; run reach:build first');
  }
  if (distinct.length > 1) {
    throw new Error(`The city's nearest-place data mixes methods (${distinct.join(', ')}); run reach:build again`);
  }
  const [method] = distinct;
  if (!isReachMethod(method)) {
    throw new Error(`The city's nearest places use an unknown method "${method}"`);
  }
  return method;
}
