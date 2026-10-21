import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fromFile } from 'geotiff';
import { windowForBox } from './population.js';
import type { Box, PixelWindow, RasterGrid } from './population.js';

export interface GhslWindow {
  grid: RasterGrid;
  win: PixelWindow;
  /** The window's people-per-pixel values, row-major. */
  values: ArrayLike<number>;
}

/** The path of the tile's `.tif` in `dir`, or `null` when it is not there. */
async function findTile(dir: string, tile: string): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const name = names.find((n) => n.endsWith(`_${tile}.tif`));
  return name === undefined ? null : join(dir, name);
}

/**
 * Reads the part of one GHSL population tile that a box covers. Only that
 * window is read from disk, not the whole 12,000 x 12,000 tile. Returns `null`
 * when the box misses the tile.
 */
export async function readGhslWindow(
  dir: string,
  tile: string,
  box: Box,
): Promise<GhslWindow | null> {
  const path = await findTile(dir, tile);
  if (path === null) throw new Error(`GHSL tile ${tile} not found in ${dir}`);

  const tiff = await fromFile(path);
  try {
    const image = await tiff.getImage();
    const [originLng, originLat] = image.getOrigin();
    const [resLng, resLat] = image.getResolution();
    if (!(resLng > 0) || !(resLat < 0)) {
      throw new Error(`GHSL tile ${tile} is not a north-up raster`);
    }
    const grid: RasterGrid = {
      originLng,
      originLat,
      resLng,
      resLat,
      width: image.getWidth(),
      height: image.getHeight(),
    };

    const win = windowForBox(grid, box);
    if (win === null) return null;

    const [values] = await image.readRasters({
      window: [win.x0, win.y0, win.x1, win.y1],
      samples: [0],
    });
    return { grid, win, values };
  } finally {
    await tiff.close();
  }
}
