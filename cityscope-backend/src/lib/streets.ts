/**
 * A city's walkable street network, fetched from Overpass tile by tile.
 *
 * A whole city in one query runs out of time on the public servers, so the
 * city's box is cut into tiles and each is asked for separately. A way that
 * crosses a tile edge comes back from both tiles; the collector keeps it once,
 * by its OSM id. The result is a compact file (`StreetsFile`): nodes sorted by
 * OSM id with their coordinates in one flat array, and each way a list of node
 * indexes. Ways connect only through shared OSM nodes.
 */

/** The `highway` values a walker can use, in the order the query lists them. */
export const WALKABLE_HIGHWAYS: readonly string[] = [
  'footway',
  'path',
  'pedestrian',
  'steps',
  'living_street',
  'residential',
  'service',
  'unclassified',
  'road',
  'track',
  'cycleway',
  'bridleway',
  'corridor',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'trunk',
  'trunk_link',
];

const WALKABLE_SET: ReadonlySet<string> = new Set(WALKABLE_HIGHWAYS);

/** `foot` values that open a way its `access` tag would close. */
const FOOT_OVERRIDES: ReadonlySet<string> = new Set(['yes', 'designated', 'permissive']);

/** Whether a walker can use a way with these tags. */
export function isWalkable(tags: Readonly<Record<string, string>>): boolean {
  const highway = tags.highway;
  if (highway === undefined || !WALKABLE_SET.has(highway)) return false;
  if (tags.foot === 'no') return false;
  if ((tags.access === 'private' || tags.access === 'no') && !FOOT_OVERRIDES.has(tags.foot ?? '')) {
    return false;
  }
  return true;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Trims float noise (0.1 * 3 = 0.30000000000000004) from a tile edge. */
function tidy(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** The bounds cut into squares of `sizeDegrees`, row by row from the south-west; edge tiles are clipped to the bounds. */
export function tilesOf(bounds: Bounds, sizeDegrees: number): Bounds[] {
  if (!(sizeDegrees > 0)) throw new Error('Tile size must be positive');
  const rows = Math.ceil(tidy((bounds.north - bounds.south) / sizeDegrees));
  const cols = Math.ceil(tidy((bounds.east - bounds.west) / sizeDegrees));
  const tiles: Bounds[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      tiles.push({
        south: tidy(bounds.south + r * sizeDegrees),
        west: tidy(bounds.west + c * sizeDegrees),
        north: Math.min(bounds.north, tidy(bounds.south + (r + 1) * sizeDegrees)),
        east: Math.min(bounds.east, tidy(bounds.west + (c + 1) * sizeDegrees)),
      });
    }
  }
  return tiles;
}

/** The Overpass query for the walkable ways in one tile, with their node ids and geometry. */
export function buildStreetQuery(tile: Bounds): string {
  const highways = WALKABLE_HIGHWAYS.join('|');
  return `[out:json][timeout:180];
way["highway"~"^(${highways})$"](${tile.south},${tile.west},${tile.north},${tile.east});
out body geom;`;
}

/** One city's network, compact: nodes sorted by OSM id, `coords` = [lng0, lat0, lng1, lat1, …] to 7 decimals; each way a list of node indexes, ways sorted by OSM way id. */
export interface StreetsFile {
  version: 1;
  nodeCount: number;
  coords: number[];
  ways: number[][];
}

interface Point {
  lat: number;
  lon: number;
}

interface RawWay {
  id: number;
  nodes: number[];
  geometry: Point[];
  tags: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.lat === 'number' && typeof value.lon === 'number';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/** A way element in the shape Overpass's `out body geom` gives; anything else is null. */
function rawWayOf(element: unknown): RawWay | null {
  if (!isRecord(element) || element.type !== 'way' || typeof element.id !== 'number') return null;
  const { nodes, geometry, tags } = element;
  if (!Array.isArray(nodes) || !nodes.every(isNumber)) return null;
  if (!Array.isArray(geometry) || !geometry.every(isPoint)) return null;
  if (nodes.length !== geometry.length) return null;
  const cleanTags: Record<string, string> = {};
  if (isRecord(tags)) {
    for (const [key, value] of Object.entries(tags)) {
      if (typeof value === 'string') cleanTags[key] = value;
    }
  }
  return { id: element.id, nodes, geometry, tags: cleanTags };
}

function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

/** Collects the tiles' answers into one network. */
export class StreetsCollector {
  private readonly nodes = new Map<number, [number, number]>();
  private readonly ways = new Map<number, number[]>();

  /** Adds one tile's answer. `ways` counts the way elements in it, `kept` those it added: walkable, 2+ nodes, and not seen in an earlier tile. */
  addOverpassAnswer(body: unknown): { ways: number; kept: number } {
    const elements = isRecord(body) ? body.elements : undefined;
    if (!Array.isArray(elements)) throw new Error('Overpass response has no elements array');

    let ways = 0;
    let kept = 0;
    for (const element of elements) {
      const way = rawWayOf(element);
      if (way === null) continue;
      ways += 1;
      if (!isWalkable(way.tags) || way.nodes.length < 2 || this.ways.has(way.id)) continue;
      way.nodes.forEach((osmId, i) => {
        if (!this.nodes.has(osmId)) {
          this.nodes.set(osmId, [round7(way.geometry[i].lon), round7(way.geometry[i].lat)]);
        }
      });
      this.ways.set(way.id, way.nodes);
      kept += 1;
    }
    return { ways, kept };
  }

  toFile(): StreetsFile {
    const nodeIds = [...this.nodes.keys()].sort((a, b) => a - b);
    const indexOf = new Map<number, number>();
    const coords: number[] = [];
    nodeIds.forEach((osmId, index) => {
      indexOf.set(osmId, index);
      const lngLat = this.nodes.get(osmId);
      if (lngLat) coords.push(lngLat[0], lngLat[1]);
    });
    const ways = [...this.ways.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, osmIds]) => osmIds.map((osmId) => indexOf.get(osmId) ?? -1));
    return { version: 1, nodeCount: nodeIds.length, coords, ways };
  }
}

/** Reads a streets file's text, refusing one whose arrays do not agree. */
export function parseStreetsFile(text: string): StreetsFile {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed.version !== 1) throw new Error('Not a version 1 streets file');
  const { nodeCount, coords, ways } = parsed;
  if (typeof nodeCount !== 'number' || !Number.isInteger(nodeCount) || nodeCount < 0) {
    throw new Error('Streets file has a bad nodeCount');
  }
  if (!Array.isArray(coords) || !coords.every(isNumber)) {
    throw new Error('Streets file has bad coords');
  }
  if (coords.length !== 2 * nodeCount) {
    throw new Error(`Streets file has ${coords.length} coords for ${nodeCount} nodes`);
  }
  if (!Array.isArray(ways)) throw new Error('Streets file has no ways');
  const checked: number[][] = [];
  for (const way of ways) {
    if (!Array.isArray(way) || !way.every(isNumber)) throw new Error('Streets file has a bad way');
    for (const index of way) {
      if (!Number.isInteger(index) || index < 0 || index >= nodeCount) {
        throw new Error(`Streets file has a way with node index ${index} outside 0..${nodeCount - 1}`);
      }
    }
    checked.push(way);
  }
  return { version: 1, nodeCount, coords, ways: checked };
}
