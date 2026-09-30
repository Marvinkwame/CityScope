import { describe, it, expect } from 'vitest';
import { POI_CATEGORIES, classifyPoi, buildOverpassQuery } from './poiCategories';

describe('POI_CATEGORIES', () => {
  it('is exactly the 11 intended categories', () => {
    expect([...POI_CATEGORIES].sort()).toEqual(
      ['attraction', 'bakery', 'bar', 'cafe', 'hotel', 'museum', 'park', 'playground', 'pub', 'restaurant', 'supermarket'],
    );
  });
});

describe('classifyPoi', () => {
  it('classifies each intended value from its own tag', () => {
    expect(classifyPoi({ amenity: 'cafe' })).toBe('cafe');
    expect(classifyPoi({ amenity: 'pub' })).toBe('pub');
    expect(classifyPoi({ tourism: 'museum' })).toBe('museum');
    expect(classifyPoi({ leisure: 'park' })).toBe('park');
    expect(classifyPoi({ shop: 'supermarket' })).toBe('supermarket');
  });

  // Every value below was found in the live pois table on 2026-09-30,
  // produced by the old unanchored Overpass regexes.
  it.each([
    ['amenity', 'public_bookcase'],
    ['amenity', 'public_bath'],
    ['amenity', 'internet_cafe'],
    ['amenity', 'cyber_cafe'],
    ['amenity', 'juice_bar'],
    ['amenity', 'disused:restaurant'],
    ['leisure', 'dog_park'],
    ['leisure', 'water_park'],
    ['tourism', 'love_hotel'],
  ])('rejects substring look-alike %s=%s', (tag, value) => {
    expect(classifyPoi({ [tag]: value })).toBeNull();
  });

  it('takes the category from the tag that matched, not the first tag present', () => {
    // Old behaviour: amenity is checked first, so this became "pharmacy".
    expect(classifyPoi({ amenity: 'pharmacy', shop: 'bakery' })).toBe('bakery');
  });

  it('returns null when no tag carries an allowed value', () => {
    expect(classifyPoi({ amenity: 'pharmacy' })).toBeNull();
    expect(classifyPoi({ shop: 'Lebara Games Land' })).toBeNull();
    expect(classifyPoi({})).toBeNull();
  });

  it('takes the first allowed value from a semicolon list', () => {
    expect(classifyPoi({ amenity: 'restaurant;bar' })).toBe('restaurant');
    expect(classifyPoi({ amenity: 'nightclub;restaurant' })).toBe('restaurant');
    expect(classifyPoi({ shop: 'bakery;pastry' })).toBe('bakery');
    expect(classifyPoi({ amenity: 'cafe ; bar' })).toBe('cafe');
  });

  it('keeps tag priority amenity > tourism > leisure > shop when several match', () => {
    expect(classifyPoi({ amenity: 'cafe', shop: 'bakery' })).toBe('cafe');
    expect(classifyPoi({ tourism: 'hotel', amenity: 'restaurant' })).toBe('restaurant');
  });
});

describe('buildOverpassQuery', () => {
  const q = buildOverpassQuery('52.34,13.08,52.68,13.76');

  it('anchors every value so substrings cannot match', () => {
    expect(q).toContain('node["amenity"~"(^|;)(cafe|restaurant|bar|pub)(;|$)"](52.34,13.08,52.68,13.76);');
    expect(q).toContain('node["tourism"~"(^|;)(museum|hotel|attraction)(;|$)"]');
    expect(q).toContain('node["leisure"~"(^|;)(park|playground)(;|$)"]');
    expect(q).toContain('node["shop"~"(^|;)(supermarket|bakery)(;|$)"]');
    expect(q).toContain('out center;');
  });
});
