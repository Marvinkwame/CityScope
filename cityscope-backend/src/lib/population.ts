import { latLngToCell, polygonToCells } from 'h3-js';
import type { MultiPolygonGeometry, PolygonGeometry } from './geometry.js';

/** The H3 resolution every everyday-reach cell is measured at (about 0.1 km² each). */
export const H3_RESOLUTION = 9;

/** A WGS84 box in degrees. */
export interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Where a north-up raster sits on the earth: the north-west corner, the pixel
 * size in degrees, and the raster's size in pixels. `resLat` is negative
 * because rows run from north to south.
 */
export interface RasterGrid {
  originLng: number;
  originLat: number;
  resLng: number;
  resLat: number;
  width: number;
  height: number;
}

/** A rectangle of pixels within a grid. `x1` and `y1` are exclusive. */
export interface PixelWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Degrees per side of a GHSL 4326 tile. */
const TILE_DEGREES = 10;

/**
 * Where the GHSL 4326 tile grid starts. It is not at 90°N / 180°W: reading
 * the tiles' own georeferencing shows the grid is anchored at 89.0996°N and
 * 180.0079°W, so every tile edge sits 0.9004° south and 0.0079° west of the
 * round 10° line. Row and column numbers count from here.
 */
const GRID_NORTH = 89.0996;
const GRID_WEST = -180.0079;

/**
 * The GHSL 3-arcsecond tile ids (`R<row>_C<col>`) a box touches, row by row.
 * A box edge that sits exactly on a tile border does not reach into the tile
 * beyond it.
 */
export function tilesForBox(box: Box): string[] {
  const rowFirst = Math.floor((GRID_NORTH - box.north) / TILE_DEGREES) + 1;
  const rowLast = Math.max(rowFirst, Math.ceil((GRID_NORTH - box.south) / TILE_DEGREES));
  const colFirst = Math.floor((box.west - GRID_WEST) / TILE_DEGREES) + 1;
  const colLast = Math.max(colFirst, Math.ceil((box.east - GRID_WEST) / TILE_DEGREES));

  const tiles: string[] = [];
  for (let row = rowFirst; row <= rowLast; row++) {
    for (let col = colFirst; col <= colLast; col++) {
      tiles.push(`R${row}_C${col}`);
    }
  }
  return tiles;
}

/**
 * The pixels of `grid` that a box touches, clamped to the grid, or `null` when
 * the box misses the grid altogether.
 */
export function windowForBox(grid: RasterGrid, box: Box): PixelWindow | null {
  const x0 = Math.max(0, Math.floor((box.west - grid.originLng) / grid.resLng));
  const x1 = Math.min(grid.width, Math.ceil((box.east - grid.originLng) / grid.resLng));
  // resLat is negative, so the north edge gives the first row.
  const y0 = Math.max(0, Math.floor((box.north - grid.originLat) / grid.resLat));
  const y1 = Math.min(grid.height, Math.ceil((box.south - grid.originLat) / grid.resLat));

  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

/** The coordinates of the middle of pixel `(x, y)`. */
export function pixelCentre(grid: RasterGrid, x: number, y: number): { lng: number; lat: number } {
  return {
    lng: grid.originLng + (x + 0.5) * grid.resLng,
    lat: grid.originLat + (y + 0.5) * grid.resLat,
  };
}

/**
 * Below this, in square degrees (about a hundredth of a square metre), a ring
 * encloses nothing but the floating-point noise between its corners.
 */
const NOISE_AREA_DEG2 = 1e-12;

/**
 * The area a ring encloses in square degrees: flat, which is plenty for telling
 * noise from a shape. The corners are measured from the ring's first corner, so
 * the cross products are of small offsets rather than of full coordinates: at
 * about 151 x -34 those are near 5,000, and their rounding alone is around
 * 1e-12, the size of the noise guard below. An empty ring has no area.
 */
export function ringAreaDeg2(ring: readonly (readonly number[])[]): number {
  if (ring.length === 0) return 0;
  const [x0, y0] = ring[0];
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i][0] - x0;
    const ay = ring[i][1] - y0;
    const bx = ring[i + 1][0] - x0;
    const by = ring[i + 1][1] - y0;
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
}

/**
 * The cells whose centres lie inside an outline.
 *
 * Merging districts (ST_Union) can leave slivers with no area, only
 * floating-point noise between their corners, and H3 throws on some of them.
 * A shape with no area holds no cell centre, so those are left out, and so is
 * a polygon with no rings at all.
 */
export function cellsForOutline(
  outline: PolygonGeometry | MultiPolygonGeometry,
  resolution: number = H3_RESOLUTION,
): Set<string> {
  const polygons = outline.type === 'Polygon' ? [outline.coordinates] : outline.coordinates;
  const cells = new Set<string>();
  for (const rings of polygons) {
    if (rings.length === 0 || ringAreaDeg2(rings[0]) < NOISE_AREA_DEG2) continue;
    for (const cell of polygonToCells(rings, resolution, true)) cells.add(cell);
  }
  return cells;
}

/**
 * Adds a window of population pixels into per-cell totals. A pixel counts for
 * the cell its centre falls in, and only when that cell is in `allowed`.
 * Zero, negative and no-data (NaN) pixels count for nothing. `values` is the
 * window in row-major order, so pixel `(x, y)` is at
 * `values[(y - y0) * (x1 - x0) + (x - x0)]`.
 *
 * `target` is added to, not replaced, so adjacent tiles can share one map.
 */
export function addPixelsToCells(
  target: Map<string, number>,
  values: ArrayLike<number>,
  grid: RasterGrid,
  win: PixelWindow,
  allowed: ReadonlySet<string>,
  resolution: number = H3_RESOLUTION,
): void {
  const width = win.x1 - win.x0;
  for (let y = win.y0; y < win.y1; y++) {
    for (let x = win.x0; x < win.x1; x++) {
      const residents = values[(y - win.y0) * width + (x - win.x0)];
      if (!Number.isFinite(residents) || residents <= 0) continue;

      const { lng, lat } = pixelCentre(grid, x, y);
      const cell = latLngToCell(lat, lng, resolution);
      if (!allowed.has(cell)) continue;

      target.set(cell, (target.get(cell) ?? 0) + residents);
    }
  }
}

/** Rounds each cell to whole people and drops the cells left with none. */
export function keptCells(residents: ReadonlyMap<string, number>): Map<string, number> {
  const kept = new Map<string, number>();
  for (const [cell, people] of residents) {
    const rounded = Math.round(people);
    if (rounded >= 1) kept.set(cell, rounded);
  }
  return kept;
}
