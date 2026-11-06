import { useDrawStore } from '../store/drawStore';
import { useFeatureStore } from '../store/featureStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useLayerStore } from '../store/layerStore';
import { useReachStore } from '../store/reachStore';
import { useRouteStore } from '../store/routeStore';

/** Everyday reach owns the whole map: the heatmap and the three tools go off. */
export function clearForReach(): void {
  useIsochroneStore.getState().setEnabled(false);
  useRouteStore.getState().setEnabled(false);
  useDrawStore.getState().setEnabled(false);
  const { layers, setLayers } = useLayerStore.getState();
  setLayers({ ...layers, heatmap: false });
  useHeatmapStore.getState().setClickOrigin(null);
  useFeatureStore.getState().clearFeature();
}

/** Called when a tool or the heatmap turns on, so reach never shares the map. */
export function clearReach(): void {
  useReachStore.getState().setEnabled(false);
}
