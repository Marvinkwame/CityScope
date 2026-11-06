import { beforeEach, describe, expect, it } from 'vitest';
import { useFeatureStore } from '../store/featureStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useReachStore } from '../store/reachStore';
import { useRouteStore } from '../store/routeStore';
import { resetForCityChange } from './cityChange';

describe('resetForCityChange', () => {
  beforeEach(() => {
    useReachStore.setState({ enabled: false, minutes: 15, needs: ['sm', 'ph', 'dr', 'sc', 'pk', 'st'], selectedCell: null });
  });

  it('clears the selected block but keeps the switch, time and needs', () => {
    useReachStore.setState({ enabled: true, minutes: 10, needs: ['pk'], selectedCell: '891f1d48947ffff' });
    resetForCityChange();
    expect(useReachStore.getState()).toMatchObject({
      enabled: true,
      minutes: 10,
      needs: ['pk'],
      selectedCell: null,
    });
  });

  it('runs the existing per-city resets', () => {
    useIsochroneStore.setState({ origin: { lng: 1, lat: 2 } });
    useRouteStore.setState({ origin: { lng: 1, lat: 2 } });
    useHeatmapStore.setState({ clickOrigin: { lng: 1, lat: 2 } });
    useFeatureStore.setState({
      selectedFeature: { type: 'roads', sourceLayerId: 'road', name: null, coordinates: { lng: 1, lat: 2 }, properties: {} },
    });
    resetForCityChange();
    expect(useIsochroneStore.getState().origin).toBeNull();
    expect(useRouteStore.getState().origin).toBeNull();
    expect(useHeatmapStore.getState().clickOrigin).toBeNull();
    expect(useFeatureStore.getState().selectedFeature).toBeNull();
  });
});
