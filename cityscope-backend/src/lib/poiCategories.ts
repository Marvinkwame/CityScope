/**
 * Which OpenStreetMap features CityScope treats as points of interest, and how
 * each one is categorised.
 *
 * Rules are ordered by priority: when a feature carries allowed values on more
 * than one tag, the earlier rule wins
 * (amenity > tourism > leisure > shop > railway > healthcare).
 *
 * `values` are the OSM tag values a rule accepts. A rule may also carry an
 * `output` map that renames a value on the way out. The category a feature is
 * stored under is the output value, so `PoiCategory` is the union of outputs,
 * not of inputs.
 *
 * healthcare=* is the newer tagging for the places older data tags as
 * amenity=pharmacy, doctors or clinic, so both routes land on one category.
 * The only spelling that differs is the doctor's surgery: healthcare=doctor
 * against amenity=doctors. It is stored as "doctors", so a list of categories
 * never shows two "Doctor" rows.
 */
const RULES = [
  {
    tag: 'amenity',
    values: ['cafe', 'restaurant', 'bar', 'pub', 'pharmacy', 'doctors', 'clinic', 'school'],
  },
  { tag: 'tourism', values: ['museum', 'hotel', 'attraction'] },
  { tag: 'leisure', values: ['park', 'playground'] },
  { tag: 'shop', values: ['supermarket', 'bakery'] },
  { tag: 'railway', values: ['station', 'halt', 'tram_stop', 'subway_entrance'] },
  { tag: 'healthcare', values: ['pharmacy', 'doctor', 'clinic'], output: { doctor: 'doctors' } },
] as const;

type Rule = (typeof RULES)[number];

/** The rename map of a rule, or an empty one when the rule has no `output`. */
type Renames<R> = R extends { readonly output: infer M } ? M : Record<never, never>;

/** Every category a rule can produce: each value, renamed if the rule says so. */
type OutputOf<R> = R extends { readonly values: readonly (infer V)[] }
  ? V extends keyof Renames<R>
    ? Renames<R>[V]
    : V
  : never;

export type PoiCategory = OutputOf<Rule>;

/**
 * The category stored for a value a rule matched.
 *
 * PoiCategory is derived from these same rules, so a renamed or unrenamed
 * value is always one of its members. TypeScript cannot follow the lookup
 * through a string key, hence the single cast.
 */
function categoryFor(rule: Rule, value: string): PoiCategory {
  const renames: Readonly<Record<string, string>> = 'output' in rule ? rule.output : {};
  return (renames[value] ?? value) as PoiCategory;
}

/**
 * Several rules can produce the same category (amenity=pharmacy and
 * healthcare=pharmacy), so the set removes the repeats.
 */
export const POI_CATEGORIES: readonly PoiCategory[] = [
  ...new Set<PoiCategory>(
    RULES.flatMap((rule) => rule.values.map((value) => categoryFor(rule, value))),
  ),
];

/**
 * Returns the category for a feature's tags, or null if it isn't one we keep.
 *
 * Only exact, allowed values count. The previous pipeline had two faults this
 * replaces:
 *   - its Overpass filters were unanchored regexes, so "pub" also matched
 *     public_bookcase, "cafe" matched internet_cafe, "park" matched dog_park;
 *   - it categorised from the first tag present rather than the tag that
 *     matched, so a node matched via shop=bakery but tagged amenity=bank
 *     was stored as "bank".
 *
 * OSM allows several values separated by ";" (e.g. "restaurant;bar"); the first
 * allowed value is used.
 *
 * A railway match is rejected when station=miniature: park railways carry
 * railway=station too, but they are not transport.
 */
export function classifyPoi(tags: Record<string, string>): PoiCategory | null {
  for (const rule of RULES) {
    const raw = tags[rule.tag];
    if (!raw) continue;
    if (rule.tag === 'railway' && tags.station === 'miniature') continue;
    for (const part of raw.split(';')) {
      const value = part.trim();
      const match = rule.values.find((v) => v === value);
      if (match) return categoryFor(rule, match);
    }
  }
  return null;
}

/**
 * Builds the Overpass QL query for one bounding box ("south,west,north,east").
 *
 * - `nwr` rather than `node`: parks, and many museums, hotels and
 *   attractions, are mapped as areas. `out center` returns each area as its
 *   centre point, which the fetch script already reads.
 * - `(^|;)value(;|$)` anchors each value to a whole semicolon-separated token,
 *   so substrings cannot match but multi-values like "restaurant;bar" still do.
 * - Selectors list a rule's input values, as OSM spells them
 *   (healthcare=doctor), not the renamed categories.
 *
 * The filter only narrows what Overpass sends; classifyPoi is still the
 * authority on what gets kept.
 */
export function buildOverpassQuery(bbox: string): string {
  const selectors = RULES.map(
    (r) => `      nwr["${r.tag}"~"(^|;)(${r.values.join('|')})(;|$)"](${bbox});`,
  ).join('\n');
  return `
    [out:json][timeout:180];
    (
${selectors}
    );
    out center;
  `;
}
