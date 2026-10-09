import { describe, it, expect } from 'vitest';
import { decodeState, encodeState } from './shareCodec';
import { EXAMPLES } from './examples';

describe('EXAMPLES', () => {
  // The decoder is strict about tool contents and drops an invalid tool
  // silently, so a typo in a hand-written example would only surface at
  // runtime as an example that "does nothing".
  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    '%s round-trips through the share codec unchanged',
    (_id, example) => {
      expect(decodeState(encodeState(example.state))).toEqual(example.state);
    },
  );

  it('has unique ids', () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps POI counts out of the kickers, which would go stale on a re-seed', () => {
    for (const e of EXAMPLES) expect(e.kicker).not.toMatch(/\d/);
  });
});
