import { useFeatureStore } from '../store/featureStore';
import { useGeoSearchStore } from '../store/geoSearchStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useReachStore } from '../store/reachStore';
import { useRouteStore } from '../store/routeStore';

/** Clears everything tied to the previous city. Reach keeps its switch, time and needs. */
export function resetForCityChange(): void {
  useFeatureStore.getState().clearFeature();
  useIsochroneStore.getState().reset();
  useHeatmapStore.getState().setClickOrigin(null);
  useRouteStore.getState().reset();
  useGeoSearchStore.getState().setResult(null);
  useReachStore.getState().selectCell(null);
}
