/**
 * Which OpenStreetMap features CityScope treats as points of interest, and how
 * each one is categorised.
 *
 * Rules are ordered by priority: when a feature carries allowed values on more
 * than one tag, the earlier rule wins (amenity > tourism > leisure > shop).
 */
const RULES = [
  { tag: 'amenity', values: ['cafe', 'restaurant', 'bar', 'pub'] },
  { tag: 'tourism', values: ['museum', 'hotel', 'attraction'] },
  { tag: 'leisure', values: ['park', 'playground'] },
  { tag: 'shop', values: ['supermarket', 'bakery'] },
] as const;

export type PoiCategory = (typeof RULES)[number]['values'][number];

export const POI_CATEGORIES: readonly PoiCategory[] = RULES.flatMap((r) => r.values);

/**
 * Returns the category for a feature's tags, or null if it isn't one we keep.
 *
 * Only exact, allowed values count. The previous pipeline had two faults this
 * replaces:
 *   - its Overpass filters were unanchored regexes, so "pub" also matched
 *     public_bookcase, "cafe" matched internet_cafe, "park" matched dog_park;
 *   - it categorised from the first tag present rather than the tag that
 *     matched, so a node matched via shop=bakery but tagged amenity=pharmacy
 *     was stored as "pharmacy".
 *
 * OSM allows several values separated by ";" (e.g. "restaurant;bar"); the first
 * allowed value is used.
 */
export function classifyPoi(tags: Record<string, string>): PoiCategory | null {
  for (const rule of RULES) {
    const raw = tags[rule.tag];
    if (!raw) continue;
    for (const part of raw.split(';')) {
      const value = part.trim();
      const match = rule.values.find((v) => v === value);
      if (match) return match;
    }
  }
  return null;
}

/**
 * Builds the Overpass QL query for one bounding box ("south,west,north,east").
 *
 * - `(^|;)value(;|$)` anchors each value to a whole semicolon-separated token,
 *   so substrings cannot match but multi-values like "restaurant;bar" still do.
 *
 * The filter only narrows what Overpass sends; classifyPoi is still the
 * authority on what gets kept.
 */
export function buildOverpassQuery(bbox: string): string {
  const selectors = RULES.map(
    (r) => `      node["${r.tag}"~"(^|;)(${r.values.join('|')})(;|$)"](${bbox});`,
  ).join('\n');
  return `
    [out:json][timeout:180];
    (
${selectors}
    );
    out center;
  `;
}
