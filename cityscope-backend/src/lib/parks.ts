/**
 * Parks as shapes.
 *
 * Everyday reach measures a block's distance to the nearest park's edge, not to
 * a point in the middle of it: someone beside the Tiergarten is next to it, not
 * a kilometre away from its centre. So parks are fetched with their outlines
 * and kept as polygons.
 */

import osmtogeojson from 'osmtogeojson';
import type { MultiPolygonGeometry, PolygonGeometry } from './geometry.js';

export interface ParkFeature {
  /** `way/<id>` or `relation/<id>`: the same park keeps the same id between fetches. */
  osmId: string;
  name: string | null;
  geometry: PolygonGeometry | MultiPolygonGeometry;
}

/**
 * The Overpass query for every park in a box. `bbox` is `south,west,north,east`,
 * the order Overpass takes. `nwr` is node, way and relation in one; `out geom`
 * puts each way's points, and each relation member's points, in the response so
 * no second request is needed to look nodes up.
 */
export function buildParkQuery(bbox: string): string {
  return `[out:json][timeout:180];\nnwr["leisure"="park"](${bbox});\nout geom;`;
}

/**
 * Turns an Overpass response into park polygons.
 *
 * osmtogeojson stitches a relation's member ways into closed rings and leaves a
 * way that does not close as a line. Only features tagged `leisure=park` that
 * come out as a Polygon or MultiPolygon are kept, so an open outline, a garden
 * and a stray tagged node are all dropped.
 */
export function parksFromOverpass(osm: unknown): ParkFeature[] {
  const collection = osmtogeojson(osm, { flatProperties: true });

  const parks: ParkFeature[] = [];
  for (const feature of collection.features) {
    if (feature.properties?.leisure !== 'park') continue;

    const geometry = feature.geometry;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;

    const id = feature.id;
    if (typeof id !== 'string' || !/^(way|relation)\/\d+$/.test(id)) continue;

    const name: unknown = feature.properties?.name;
    parks.push({
      osmId: id,
      name: typeof name === 'string' && name.trim() !== '' ? name : null,
      geometry,
    });
  }
  return parks;
}
