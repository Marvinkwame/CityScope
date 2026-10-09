import type { Map as MapboxMap } from 'mapbox-gl';
import { useCityStore, type City } from '../store/cityStore';
import { useLayerStore } from '../store/layerStore';
import { useMapStore } from '../store/mapStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useDrawStore } from '../store/drawStore';
import { useFeatureStore } from '../store/featureStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useGeoSearchStore } from '../store/geoSearchStore';
import type { ShareState } from './shareCodec';

// Module-level flag so MapView can suppress its city-change reset/flyTo while we hydrate.
let hydrating = false;
export const isHydrating = (): boolean => hydrating;

export function collectShareState(map: MapboxMap): ShareState {
  const c = map.getCenter();
  const iso = useIsochroneStore.getState();
  const route = useRouteStore.getState();
  const draw = useDrawStore.getState();

  let tool: ShareState['tool'];
  if (iso.enabled && iso.origin) {
    tool = { kind: 'isochrone', profile: iso.profile, contourMinutes: iso.contourMinutes, origin: iso.origin };
  } else if (route.enabled && route.origin && route.destination) {
    tool = { kind: 'route', profile: route.profile, origin: route.origin, destination: route.destination };
  } else if (draw.enabled && draw.polygon) {
    tool = { kind: 'draw', polygon: draw.polygon };
  }

  return {
    v: 1,
    city: useCityStore.getState().selectedCity.id,
    view: { lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
    layers: { ...useLayerStore.getState().layers },
    is3D: useMapStore.getState().is3D,
    tool,
  };
}

export function applyShareState(state: ShareState, map: MapboxMap, cities: City[]): void {
  hydrating = true;

  // A share state is a whole view: drop what belonged to the previous one.
  // (On page load these are already empty; an example applied mid-session
  // would otherwise keep, say, a Berlin district's panel open over Tokyo.)
  useFeatureStore.getState().clearFeature();
  useHeatmapStore.getState().setClickOrigin(null);
  useGeoSearchStore.getState().setResult(null);

  const city = cities.find((c) => c.id === state.city);
  if (city) useCityStore.getState().setCity(city);

  useLayerStore.getState().setLayers(state.layers);
  useMapStore.getState().setIs3D(state.is3D);

  // reset all tools, then enable the one in the shared state
  useIsochroneStore.getState().setEnabled(false);
  useRouteStore.getState().setEnabled(false);
  useDrawStore.getState().setEnabled(false);

  const t = state.tool;
  if (t?.kind === 'isochrone') {
    const iso = useIsochroneStore.getState();
    iso.setProfile(t.profile);
    iso.setContourMinutes(t.contourMinutes);
    iso.setOrigin(t.origin);
    iso.setEnabled(true);
  } else if (t?.kind === 'route') {
    const r = useRouteStore.getState();
    r.setProfile(t.profile);
    r.setOrigin(t.origin);
    r.setDestination(t.destination);
    r.setEnabled(true);
  } else if (t?.kind === 'draw') {
    const d = useDrawStore.getState();
    d.setEnabled(true);
    d.setPolygon(t.polygon);
  }

  map.jumpTo({
    center: [state.view.lng, state.view.lat],
    zoom: state.view.zoom,
    bearing: state.view.bearing,
    pitch: state.view.pitch,
  });

  // Clear the flag on the next macrotask, after React has flushed the
  // city-change effect (which reads isHydrating() and bails).
  setTimeout(() => {
    hydrating = false;
  }, 0);
}
