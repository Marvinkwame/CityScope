import { beforeEach, describe, expect, it } from 'vitest';
import { useDrawStore } from '../store/drawStore';
import { useFeatureStore } from '../store/featureStore';
import type { SelectedFeature } from '../store/featureStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useLayerStore } from '../store/layerStore';
import { useReachStore } from '../store/reachStore';
import { useRouteStore } from '../store/routeStore';
import { clearForReach, clearReach } from './viewExclusivity';

const FEATURE: SelectedFeature = {
  type: 'buildings',
  sourceLayerId: 'building',
  name: 'Hall',
  coordinates: { lng: 1, lat: 2 },
  properties: {},
};

describe('viewExclusivity', () => {
  beforeEach(() => {
    useIsochroneStore.setState({ enabled: false });
    useRouteStore.setState({ enabled: false });
    useDrawStore.setState({ enabled: false });
    useLayerStore.setState({ layers: { roads: true, buildings: true, districts: false, heatmap: false } });
    useHeatmapStore.setState({ clickOrigin: null });
    useFeatureStore.setState({ selectedFeature: null });
    useReachStore.setState({ enabled: false });
  });

  it('clearForReach turns off the heatmap and every tool', () => {
    useIsochroneStore.setState({ enabled: true });
    useRouteStore.setState({ enabled: true });
    useDrawStore.setState({ enabled: true });
    useLayerStore.setState({ layers: { roads: true, buildings: true, districts: true, heatmap: true } });
    useHeatmapStore.setState({ clickOrigin: { lng: 1, lat: 2 } });
    useFeatureStore.setState({ selectedFeature: FEATURE });

    clearForReach();

    expect(useIsochroneStore.getState().enabled).toBe(false);
    expect(useRouteStore.getState().enabled).toBe(false);
    expect(useDrawStore.getState().enabled).toBe(false);
    expect(useLayerStore.getState().layers.heatmap).toBe(false);
    expect(useHeatmapStore.getState().clickOrigin).toBeNull();
    expect(useFeatureStore.getState().selectedFeature).toBeNull();
  });

  it('clearForReach leaves the other layers as they were', () => {
    useLayerStore.setState({ layers: { roads: false, buildings: true, districts: true, heatmap: true } });
    clearForReach();
    expect(useLayerStore.getState().layers).toEqual({
      roads: false,
      buildings: true,
      districts: true,
      heatmap: false,
    });
  });

  it('clearReach turns reach off and leaves the heatmap alone', () => {
    useReachStore.setState({ enabled: true });
    useLayerStore.setState({ layers: { roads: true, buildings: true, districts: false, heatmap: true } });
    useHeatmapStore.setState({ clickOrigin: { lng: 1, lat: 2 } });

    clearReach();

    expect(useReachStore.getState().enabled).toBe(false);
    expect(useLayerStore.getState().layers.heatmap).toBe(true);
    expect(useHeatmapStore.getState().clickOrigin).toEqual({ lng: 1, lat: 2 });
  });
});
