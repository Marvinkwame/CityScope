import { useMemo } from 'react';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { Poi } from './usePois';

export interface ContourBand {
  /** Time in minutes for this contour (e.g. 5, 10, 15) */
  contour: number;
  /** All POIs reachable within this time — cumulative, not just the ring */
  pois: Poi[];
  /** { category: count } for POIs in this band */
  categoryCounts: Record<string, number>;
}

/**
 * Spatial analysis: for each isochrone contour band, find all POIs that fall
 * within the polygon (cumulative — smaller polygons are subsets of larger ones).
 */
export function useIsochroneResults(
  isochroneData: GeoJSON.FeatureCollection | undefined,
  poisData: Poi[] | undefined,
): ContourBand[] {
  return useMemo(() => {
    if (!isochroneData || !poisData || poisData.length === 0) return [];

    // Extract and sort contour features ascending (smallest = innermost first)
    const contourFeatures = [...isochroneData.features]
      .filter(
        (f) =>
          f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
      )
      .sort(
        (a, b) =>
          ((a.properties?.contour as number) ?? 0) -
          ((b.properties?.contour as number) ?? 0),
      ) as Feature<Polygon | MultiPolygon>[];

    if (contourFeatures.length === 0) return [];

    return contourFeatures.map((feature) => {
      const contour = (feature.properties?.contour as number) ?? 0;
      const pois: Poi[] = [];

      for (const poi of poisData) {
        const pt = point([poi.lng, poi.lat]);
        if (booleanPointInPolygon(pt, feature)) {
          pois.push(poi);
        }
      }

      const categoryCounts: Record<string, number> = {};
      for (const poi of pois) {
        categoryCounts[poi.category] = (categoryCounts[poi.category] ?? 0) + 1;
      }

      return { contour, pois, categoryCounts };
    });
  }, [isochroneData, poisData]);
}
