import { describe, it, expect } from 'vitest';
import { POI_CATEGORIES, classifyPoi, buildOverpassQuery } from './poiCategories';

describe('POI_CATEGORIES', () => {
  it('is exactly the 19 intended categories', () => {
    expect([...POI_CATEGORIES].sort()).toEqual([
      'attraction', 'bakery', 'bar', 'cafe', 'clinic', 'doctors', 'halt', 'hotel', 'museum', 'park',
      'pharmacy', 'playground', 'pub', 'restaurant', 'school', 'station', 'subway_entrance',
      'supermarket', 'tram_stop',
    ]);
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
    // Old behaviour: amenity is checked first, so this became "bank".
    expect(classifyPoi({ amenity: 'bank', shop: 'bakery' })).toBe('bakery');
  });

  it('returns null when no tag carries an allowed value', () => {
    expect(classifyPoi({ amenity: 'bank' })).toBeNull();
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

  it('classifies the new tags', () => {
    expect(classifyPoi({ amenity: 'pharmacy' })).toBe('pharmacy');
    expect(classifyPoi({ healthcare: 'pharmacy' })).toBe('pharmacy');
    expect(classifyPoi({ amenity: 'doctors' })).toBe('doctors');
    expect(classifyPoi({ healthcare: 'doctor' })).toBe('doctors');
    expect(classifyPoi({ healthcare: 'clinic' })).toBe('clinic');
    expect(classifyPoi({ amenity: 'clinic' })).toBe('clinic');
    expect(classifyPoi({ amenity: 'school' })).toBe('school');
    expect(classifyPoi({ railway: 'station' })).toBe('station');
    expect(classifyPoi({ railway: 'halt' })).toBe('halt');
    expect(classifyPoi({ railway: 'tram_stop' })).toBe('tram_stop');
    expect(classifyPoi({ railway: 'subway_entrance' })).toBe('subway_entrance');
  });

  it('rejects near misses', () => {
    expect(classifyPoi({ railway: 'platform' })).toBeNull();
    expect(classifyPoi({ railway: 'subway' })).toBeNull();
    expect(classifyPoi({ healthcare: 'dentist' })).toBeNull();
    expect(classifyPoi({ amenity: 'kindergarten' })).toBeNull();
    expect(classifyPoi({ amenity: 'university' })).toBeNull();
    // A park railway is not transport.
    expect(classifyPoi({ railway: 'station', station: 'miniature' })).toBeNull();
  });

  it('keeps tag priority for the new tags', () => {
    expect(classifyPoi({ amenity: 'cafe', railway: 'station' })).toBe('cafe');
    expect(classifyPoi({ amenity: 'pharmacy', healthcare: 'pharmacy' })).toBe('pharmacy');
  });
});

describe('buildOverpassQuery', () => {
  const q = buildOverpassQuery('52.34,13.08,52.68,13.76');

  it('selects nodes, ways and relations, so area-mapped places are included', () => {
    expect(q).not.toMatch(/\bnode\[/);
    expect(q).toContain('out center;');
  });

  it('anchors every value so substrings cannot match', () => {
    expect(q).toContain(
      'nwr["amenity"~"(^|;)(cafe|restaurant|bar|pub|pharmacy|doctors|clinic|school)(;|$)"](52.34,13.08,52.68,13.76);',
    );
    expect(q).toContain('nwr["tourism"~"(^|;)(museum|hotel|attraction)(;|$)"]');
    expect(q).toContain('nwr["leisure"~"(^|;)(park|playground)(;|$)"]');
    expect(q).toContain('nwr["shop"~"(^|;)(supermarket|bakery)(;|$)"]');
  });

  it('queries the new tags', () => {
    expect(q).toContain('nwr["railway"~"(^|;)(station|halt|tram_stop|subway_entrance)(;|$)"]');
    expect(q).toContain('nwr["healthcare"~"(^|;)(pharmacy|doctor|clinic)(;|$)"]');
  });
});
