import { describe, it, expect } from 'vitest';
import { cellToLatLng, latLngToCell } from 'h3-js';
import { CITY_CONFIGS } from '../config/cities';
import {
  H3_RESOLUTION,
  addPixelsToCells,
  cellsForOutline,
  keptCells,
  pixelCentre,
  ringAreaDeg2,
  tilesForBox,
  windowForBox,
} from './population';
import type { Box, PixelWindow, RasterGrid } from './population';

function fetchBoundsOf(id: string): Box {
  const city = CITY_CONFIGS.find((c) => c.id === id);
  if (!city) throw new Error(`No city config for ${id}`);
  return city.fetchBounds;
}

// A GHSL pixel is 3 arcseconds on a side.
const PIXEL = 3 / 3600;

/** A grid of 3-arcsecond pixels with Alexanderplatz at the corner in its middle. */
function alexGrid(width: number, height: number, originLng = 13.405 - 2 * PIXEL): RasterGrid {
  return {
    originLng,
    originLat: 52.52 + 2 * PIXEL,
    resLng: PIXEL,
    resLat: -PIXEL,
    width,
    height,
  };
}

function wholeWindow(grid: RasterGrid): PixelWindow {
  return { x0: 0, y0: 0, x1: grid.width, y1: grid.height };
}

/** Every cell the grid's pixel centres fall in, so nothing is filtered out. */
function allCellsOf(grid: RasterGrid): Set<string> {
  const cells = new Set<string>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const { lng, lat } = pixelCentre(grid, x, y);
      cells.add(latLngToCell(lat, lng, H3_RESOLUTION));
    }
  }
  return cells;
}

function total(map: Map<string, number>): number {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}

describe('tilesForBox', () => {
  it.each([
    ['london', ['R4_C18', 'R4_C19']],
    ['amsterdam', ['R4_C19']],
    ['berlin', ['R4_C20']],
    ['paris', ['R5_C19']],
    ['munich', ['R5_C20']],
    ['new-york', ['R5_C11']],
    ['tokyo', ['R6_C32']],
    ['sydney', ['R13_C34']],
  ])("%s's download box needs tiles %j", (id, tiles) => {
    expect(tilesForBox(fetchBoundsOf(id))).toEqual(tiles);
  });

  // The real tiles are not on the round 10° lines. R4_C20 runs from 59.0996°N
  // to 49.0996°N and from 9.9921°E to 19.9921°E (read from the .tif files), so
  // the nominal 90°N / 180°W grid picks the wrong tile in these thin strips.
  it('follows the real tile edges, not the round 10° lines', () => {
    // 49.5°N is in row 4 here; a grid anchored at 90°N would call it row 5.
    expect(tilesForBox({ south: 49.4, west: 13, north: 49.6, east: 14 })).toEqual(['R4_C20']);
    // 9.995°E is in column 20 here; a grid anchored at 180°W would call it column 19.
    expect(tilesForBox({ south: 52, west: 9.995, north: 53, east: 10.5 })).toEqual(['R4_C20']);
  });

  it('lists every tile a box spans, row by row', () => {
    // Straddles the row 4 / row 5 edge at 49.0996°N and the column 19 / 20 edge at 9.9921°E.
    expect(tilesForBox({ south: 48.9, west: 9.9, north: 49.3, east: 10.1 })).toEqual([
      'R4_C19',
      'R4_C20',
      'R5_C19',
      'R5_C20',
    ]);
  });
});

describe('pixelCentre', () => {
  it('puts pixel (0, 0) half a pixel in from the origin corner', () => {
    const grid: RasterGrid = {
      originLng: 0,
      originLat: 10,
      resLng: 0.5,
      resLat: -0.5,
      width: 4,
      height: 4,
    };
    expect(pixelCentre(grid, 0, 0)).toEqual({ lng: 0.25, lat: 9.75 });
  });
});

describe('windowForBox', () => {
  const grid: RasterGrid = {
    originLng: 0,
    originLat: 10,
    resLng: 0.5,
    resLat: -0.5,
    width: 2,
    height: 2,
  };

  it('covers the whole grid for a box that exactly covers it', () => {
    expect(windowForBox(grid, { south: 9, west: 0, north: 10, east: 1 })).toEqual({
      x0: 0,
      y0: 0,
      x1: 2,
      y1: 2,
    });
  });

  it('clamps to the grid when the box is larger than it', () => {
    expect(windowForBox(grid, { south: 0, west: -5, north: 20, east: 5 })).toEqual({
      x0: 0,
      y0: 0,
      x1: 2,
      y1: 2,
    });
  });

  it('picks out the pixels a smaller box touches', () => {
    expect(windowForBox(grid, { south: 9, west: 0.5, north: 9.5, east: 1 })).toEqual({
      x0: 1,
      y0: 1,
      x1: 2,
      y1: 2,
    });
  });

  it('returns null for a box east of the grid', () => {
    expect(windowForBox(grid, { south: 9, west: 2, north: 10, east: 3 })).toBeNull();
  });

  it('returns null for a box south of the grid', () => {
    expect(windowForBox(grid, { south: 0, west: 0, north: 5, east: 1 })).toBeNull();
  });
});

describe('addPixelsToCells', () => {
  it('adds pixels into the cell of their centre', () => {
    const grid = alexGrid(4, 4);
    const target = new Map<string, number>();
    const values = new Float32Array(16).fill(10);

    addPixelsToCells(target, values, grid, wholeWindow(grid), allCellsOf(grid));

    expect(total(target)).toBe(160);
    const middle = pixelCentre(grid, 2, 2);
    const middleCell = latLngToCell(middle.lat, middle.lng, H3_RESOLUTION);
    expect(target.get(middleCell)).toBeGreaterThanOrEqual(10);
  });

  it('reads the window row-major from its own corner', () => {
    // One-degree pixels land in cells far apart, so each value stays in its own cell.
    const grid: RasterGrid = {
      originLng: 10,
      originLat: 53,
      resLng: 1,
      resLat: -1,
      width: 4,
      height: 4,
    };
    const win: PixelWindow = { x0: 2, y0: 1, x1: 4, y1: 3 };
    const target = new Map<string, number>();

    addPixelsToCells(target, [1, 2, 3, 4], grid, win, allCellsOf(grid));

    const cellAt = (x: number, y: number) => {
      const { lng, lat } = pixelCentre(grid, x, y);
      return latLngToCell(lat, lng, H3_RESOLUTION);
    };
    expect(target.get(cellAt(2, 1))).toBe(1);
    expect(target.get(cellAt(3, 1))).toBe(2);
    expect(target.get(cellAt(2, 2))).toBe(3);
    expect(target.get(cellAt(3, 2))).toBe(4);
    expect(target.size).toBe(4);
  });

  it('ignores no-data and negative pixels', () => {
    const grid = alexGrid(2, 2);
    const target = new Map<string, number>();

    addPixelsToCells(target, [-200, NaN, 5, 0], grid, wholeWindow(grid), allCellsOf(grid));

    expect(total(target)).toBe(5);
  });

  it('skips cells not allowed', () => {
    const grid = alexGrid(4, 4);
    const values = new Float32Array(16).fill(1);
    const first = pixelCentre(grid, 0, 0);
    const firstCell = latLngToCell(first.lat, first.lng, H3_RESOLUTION);

    const onlyFirst = new Map<string, number>();
    addPixelsToCells(onlyFirst, values, grid, wholeWindow(grid), new Set([firstCell]));
    expect([...onlyFirst.keys()]).toEqual([firstCell]);
    expect(total(onlyFirst)).toBeLessThan(16);

    const none = new Map<string, number>();
    addPixelsToCells(none, values, grid, wholeWindow(grid), new Set());
    expect(none.size).toBe(0);
  });

  it('two adjacent tiles add into one map without double counting', () => {
    // Two 1x2 grids side by side: the second starts one pixel east of the first.
    const left = alexGrid(1, 2);
    const right = alexGrid(1, 2, left.originLng + PIXEL);
    const allowed = new Set([...allCellsOf(left), ...allCellsOf(right)]);
    const target = new Map<string, number>();

    addPixelsToCells(target, [1, 1], left, wholeWindow(left), allowed);
    addPixelsToCells(target, [1, 1], right, wholeWindow(right), allowed);

    expect(total(target)).toBe(4);
  });
});

describe('keptCells', () => {
  it('rounds to whole people and keeps only cells with at least one', () => {
    const kept = keptCells(
      new Map([
        ['a', 0.4],
        ['b', 0.6],
        ['c', 12.5],
      ]),
    );

    expect(kept.has('a')).toBe(false);
    expect(kept.get('b')).toBe(1);
    expect(kept.get('c')).toBe(13);
  });
});

describe('cellsForOutline', () => {
  const alexanderplatzCell = '891f1d48947ffff';

  it('contains the cell of a point inside a small square around Alexanderplatz', () => {
    const cells = cellsForOutline({
      type: 'Polygon',
      coordinates: [
        [
          [13.403, 52.518],
          [13.407, 52.518],
          [13.407, 52.522],
          [13.403, 52.522],
          [13.403, 52.518],
        ],
      ],
    });
    expect(cells.has(alexanderplatzCell)).toBe(true);
  });

  it('joins the cells of every part of a MultiPolygon', () => {
    const square = (lng: number, lat: number) => [
      [
        [lng - 0.002, lat - 0.002],
        [lng + 0.002, lat - 0.002],
        [lng + 0.002, lat + 0.002],
        [lng - 0.002, lat + 0.002],
        [lng - 0.002, lat - 0.002],
      ],
    ];
    const cells = cellsForOutline({
      type: 'MultiPolygon',
      coordinates: [square(13.405, 52.52), square(13.5, 52.5)],
    });
    expect(cells.has(alexanderplatzCell)).toBe(true);
    expect(cells.has(latLngToCell(52.5, 13.5, H3_RESOLUTION))).toBe(true);
  });

  // Merging New York's boroughs leaves two slivers with no area, only
  // floating-point noise between their corners. H3 throws on them, but a shape
  // with no area holds no cell centre, so they are left out.
  it('leaves out a sliver with no area instead of failing on it', () => {
    const square = [
      [
        [13.403, 52.518],
        [13.407, 52.518],
        [13.407, 52.522],
        [13.403, 52.522],
        [13.403, 52.518],
      ],
    ];
    const sliverA = [
      [
        [-74.13640000000002, 40.545100000000026],
        [-74.1364, 40.5451],
        [-74.1364, 40.54509999999999],
        [-74.13640000000002, 40.545100000000026],
      ],
    ];
    const sliverB = [
      [
        [-74.0741, 40.578700000000005],
        [-74.07409999999999, 40.5787],
        [-74.0741, 40.5787],
        [-74.0741, 40.578700000000005],
      ],
    ];

    const withSlivers = cellsForOutline({ type: 'MultiPolygon', coordinates: [square, sliverA, sliverB] });
    const without = cellsForOutline({ type: 'Polygon', coordinates: square });

    expect(withSlivers).toEqual(without);
    expect(withSlivers.size).toBeGreaterThan(0);
  });

  it('reads a Polygon with no rings as empty', () => {
    expect(cellsForOutline({ type: 'Polygon', coordinates: [] })).toEqual(new Set());
  });

  it('skips a part of a MultiPolygon that has no rings', () => {
    const square = [
      [
        [13.403, 52.518],
        [13.407, 52.518],
        [13.407, 52.522],
        [13.403, 52.522],
        [13.403, 52.518],
      ],
    ];
    expect(cellsForOutline({ type: 'MultiPolygon', coordinates: [[], square] })).toEqual(
      cellsForOutline({ type: 'Polygon', coordinates: square }),
    );
  });

  it('keeps a small shape that holds a cell centre', () => {
    // Roughly 20 m across, far smaller than a cell, but drawn around a cell's
    // centre: a shape with real area, so the sliver guard must not drop it.
    const cell = latLngToCell(52.52, 13.405, H3_RESOLUTION);
    const [lat, lng] = cellToLatLng(cell);
    const d = 0.0001;
    const small = [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ];

    expect(cellsForOutline({ type: 'Polygon', coordinates: small }).has(cell)).toBe(true);
  });
});

describe('ringAreaDeg2', () => {
  it('measures a real shape', () => {
    const square = [
      [13.403, 52.518],
      [13.407, 52.518],
      [13.407, 52.522],
      [13.403, 52.522],
      [13.403, 52.518],
    ];
    expect(ringAreaDeg2(square)).toBeCloseTo(0.004 * 0.004, 15);
  });

  // Four corners on one straight line in Sydney: no area at all. Summed at
  // full coordinates (about 151 x -34), the cross products cancel to rounding
  // noise of 1.36e-12 square degrees, above the 1e-12 guard; measured from the
  // ring's first corner they do not.
  it('measures a sliver with no area as none, without float noise', () => {
    const sliver = [
      [151.19675113107394, -33.84374004060111],
      [151.19672705185965, -33.84383398316063],
      [151.19667500490667, -33.84403703895486],
      [151.19667433552996, -33.84403965045874],
      [151.19675113107394, -33.84374004060111],
    ];
    expect(ringAreaDeg2(sliver)).toBeLessThan(1e-15);
  });

  it('measures an empty ring as no area', () => {
    expect(ringAreaDeg2([])).toBe(0);
  });
});
