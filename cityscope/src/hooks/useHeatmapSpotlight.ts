import { useMemo } from 'react';
import distance from '@turf/distance';
import { useHeatmapStore } from '../store/heatmapStore';
import { usePois } from './usePois';
import type { Poi } from './usePois';

export interface SpotlightPoi extends Poi {
  distanceM: number;
}

export interface SpotlightResult {
  total: number;
  categoryCounts: Record<string, number>;
  topPois: SpotlightPoi[];
  allPois: SpotlightPoi[];
}

export function useHeatmapSpotlight(): SpotlightResult | null {
  const clickOrigin = useHeatmapStore((s) => s.clickOrigin);
  const { data: poisData } = usePois();

  return useMemo(() => {
    if (!clickOrigin || !poisData || poisData.length === 0) return null;

    const nearby: SpotlightPoi[] = poisData
      .map((poi) => ({
        ...poi,
        distanceM: Math.round(
          distance(
            [clickOrigin.lng, clickOrigin.lat],
            [poi.lng, poi.lat],
            { units: 'kilometers' },
          ) * 1000,
        ),
      }))
      .filter((poi) => poi.distanceM <= 300)
      .sort((a, b) => a.distanceM - b.distanceM);

    if (nearby.length === 0) return null;

    const categoryCounts: Record<string, number> = {};
    for (const poi of nearby) {
      categoryCounts[poi.category] = (categoryCounts[poi.category] ?? 0) + 1;
    }

    return {
      total: nearby.length,
      categoryCounts,
      topPois: nearby.slice(0, 5),
      allPois: nearby,
    };
  }, [clickOrigin, poisData]);
}
