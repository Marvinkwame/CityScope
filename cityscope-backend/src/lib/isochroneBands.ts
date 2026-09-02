export interface BandPoi {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lng: number;
}

/** One row as returned by the /in-isochrone SQL query. */
export interface BandRow extends BandPoi {
  contour: number;
}

export interface IsochroneBand {
  contour: number;
  poiCount: number;
  categoryCounts: Record<string, number>;
  pois: BandPoi[];
}

function emptyBand(contour: number): IsochroneBand {
  return { contour, poiCount: 0, categoryCounts: {}, pois: [] };
}

/**
 * Turns flat (contour, poi) rows into one entry per band, ascending by contour.
 *
 * `contours` is the list the caller asked for. Seeding from it matters: the SQL
 * join emits no rows for a contour containing zero POIs, and the UI still needs
 * that band present so it can render its empty state.
 *
 * Bands are cumulative — a POI inside the 5-minute polygon is also inside the
 * 10-minute one and is counted in both. That mirrors the client-side behaviour
 * this replaced.
 */
export function groupPoisByBand(rows: BandRow[], contours: number[]): IsochroneBand[] {
  const byContour = new Map<number, IsochroneBand>();

  for (const contour of contours) {
    byContour.set(contour, emptyBand(contour));
  }

  for (const { contour, ...poi } of rows) {
    let band = byContour.get(contour);
    if (!band) {
      band = emptyBand(contour);
      byContour.set(contour, band);
    }
    band.pois.push(poi);
    band.poiCount += 1;
    band.categoryCounts[poi.category] = (band.categoryCounts[poi.category] ?? 0) + 1;
  }

  return [...byContour.values()].sort((a, b) => a.contour - b.contour);
}
