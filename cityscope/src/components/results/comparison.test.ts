import { describe, it, expect } from 'vitest';
import { compareToCity } from './comparison';

describe('compareToCity', () => {
  it('points up for denser than average', () => {
    expect(compareToCity(142.4, 35.2)).toEqual({
      arrow: '▲',
      delta: '+142%',
      context: 'vs city avg 35/km²',
      label: '142% above the city average of 35 per km²',
    });
  });

  it('points down for sparser, with a real minus sign', () => {
    const c = compareToCity(-61.6, 35.2);
    expect(c.arrow).toBe('▼');
    expect(c.delta).toBe('−62%');
    expect(c.label).toBe('62% below the city average of 35 per km²');
  });

  it('reads "city average" when there is no comparison', () => {
    expect(compareToCity(null, 0)).toEqual({
      arrow: '≈',
      delta: null,
      context: 'city average',
      label: 'About the city average density',
    });
  });

  it('treats anything that rounds to 0% as average', () => {
    expect(compareToCity(0.4, 35).arrow).toBe('≈');
    expect(compareToCity(-0.4, 35).arrow).toBe('≈');
  });

  it('groups a large average', () => {
    expect(compareToCity(10, 1234.5).context).toBe('vs city avg 1,235/km²');
  });
});
