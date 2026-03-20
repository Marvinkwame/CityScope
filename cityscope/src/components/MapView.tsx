import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Box from '@mui/material/Box';
import { useLayerStore } from '../store/layerStore';
import { useFeatureStore } from '../store/featureStore';
import { useMapStore } from '../store/mapStore';
import {
  ROAD_LAYER_FILTER,
  BUILDING_LAYER_FILTER,
  BUILDING_EXTRUSION_LAYER_ID,
  DISTRICT_SOURCE_ID,
  DISTRICT_FILL_LAYER_ID,
  DISTRICT_LINE_LAYER_ID,
  FEATURE_TYPE_PRIORITY,
  classifyLayerId,
} from '../constants/layerConfig';
import type { LayerId } from '../constants/layerConfig';

const BERLIN_CENTER: [number, number] = [13.405, 52.52];
const DEFAULT_ZOOM = 12;

function setLayerVisibility(
  map: mapboxgl.Map,
  ids: string[],
  visible: boolean,
) {
  const value = visible ? 'visible' : 'none';
  ids.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', value);
    }
  });
}

function applyLayerVisibility(
  map: mapboxgl.Map,
  roadLayerIds: string[],
  buildingLayerIds: string[],
) {
  const currentLayers = useLayerStore.getState().layers;
  setLayerVisibility(map, roadLayerIds, currentLayers.roads);
  setLayerVisibility(map, buildingLayerIds, currentLayers.buildings);
  // Also toggle the extrusion layer with buildings
  setLayerVisibility(map, [BUILDING_EXTRUSION_LAYER_ID], currentLayers.buildings);
  setLayerVisibility(
    map,
    [DISTRICT_FILL_LAYER_ID, DISTRICT_LINE_LAYER_ID],
    currentLayers.districts,
  );
}

function getQueryableLayers(
  roadLayerIds: string[],
  buildingLayerIds: string[],
): string[] {
  const currentLayers = useLayerStore.getState().layers;
  const queryLayers: string[] = [];
  if (currentLayers.roads) queryLayers.push(...roadLayerIds);
  if (currentLayers.buildings) {
    queryLayers.push(...buildingLayerIds);
    // Include extrusion layer in queries if it exists
    queryLayers.push(BUILDING_EXTRUSION_LAYER_ID);
  }
  if (currentLayers.districts) queryLayers.push(DISTRICT_FILL_LAYER_ID);
  return queryLayers;
}

function addExtrusionLayer(map: mapboxgl.Map) {
  if (map.getLayer(BUILDING_EXTRUSION_LAYER_ID)) return;

  map.addLayer({
    id: BUILDING_EXTRUSION_LAYER_ID,
    type: 'fill-extrusion',
    source: 'composite',
    'source-layer': 'building',
    paint: {
      'fill-extrusion-color': '#90CAF9',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'min_height'],
      'fill-extrusion-opacity': 0.7,
    },
  });

  // Respect current buildings visibility
  const buildingsVisible = useLayerStore.getState().layers.buildings;
  if (!buildingsVisible) {
    map.setLayoutProperty(BUILDING_EXTRUSION_LAYER_ID, 'visibility', 'none');
  }
}

function removeExtrusionLayer(map: mapboxgl.Map) {
  if (map.getLayer(BUILDING_EXTRUSION_LAYER_ID)) {
    map.removeLayer(BUILDING_EXTRUSION_LAYER_ID);
  }
}

function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const roadLayerIdsRef = useRef<string[]>([]);
  const buildingLayerIdsRef = useRef<string[]>([]);

  const layers = useLayerStore((state) => state.layers);
  const is3D = useMapStore((state) => state.is3D);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: BERLIN_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('style.load', () => {
      const styleLayers = map.getStyle().layers;

      roadLayerIdsRef.current = styleLayers
        .filter((l) => ROAD_LAYER_FILTER(l.id))
        .map((l) => l.id);

      buildingLayerIdsRef.current = styleLayers
        .filter((l) => BUILDING_LAYER_FILTER(l.id))
        .map((l) => l.id);

      fetch('/data/berlin-districts.geojson')
        .then((res) => res.json())
        .then((geojson: GeoJSON.FeatureCollection) => {
          if (!map.getSource(DISTRICT_SOURCE_ID)) {
            map.addSource(DISTRICT_SOURCE_ID, { type: 'geojson', data: geojson });

            map.addLayer({
              id: DISTRICT_FILL_LAYER_ID,
              type: 'fill',
              source: DISTRICT_SOURCE_ID,
              paint: {
                'fill-color': '#CE93D8',
                'fill-opacity': 0.15,
              },
              layout: {
                visibility: 'none',
              },
            });

            map.addLayer({
              id: DISTRICT_LINE_LAYER_ID,
              type: 'line',
              source: DISTRICT_SOURCE_ID,
              paint: {
                'line-color': '#CE93D8',
                'line-width': 2,
                'line-opacity': 0.7,
              },
              layout: {
                visibility: 'none',
              },
            });
          }

          mapReadyRef.current = true;
          applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);

          // Apply 3D mode if it was already active
          if (useMapStore.getState().is3D) {
            addExtrusionLayer(map);
            map.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
            map.setLight({ anchor: 'viewport', color: '#fff', intensity: 0.4 });
          }
        })
        .catch((err) => {
          console.warn('Failed to load district boundaries:', err);
          mapReadyRef.current = true;
          applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
        });

      // Click handler — select features
      map.on('click', (e) => {
        const queryLayers = getQueryableLayers(
          roadLayerIdsRef.current,
          buildingLayerIdsRef.current,
        ).filter((id) => map.getLayer(id));

        if (queryLayers.length === 0) {
          useFeatureStore.getState().clearFeature();
          return;
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: queryLayers,
        });

        if (features.length === 0) {
          useFeatureStore.getState().clearFeature();
          return;
        }

        // Classify and pick highest-priority feature
        const classified = features
          .filter((f) => f.layer != null)
          .map((f) => ({ feature: f, type: classifyLayerId(f.layer!.id) }))
          .filter(
            (c): c is { feature: (typeof features)[number]; type: LayerId } =>
              c.type !== null,
          );

        if (classified.length === 0) {
          useFeatureStore.getState().clearFeature();
          return;
        }

        classified.sort(
          (a, b) => FEATURE_TYPE_PRIORITY[a.type] - FEATURE_TYPE_PRIORITY[b.type],
        );

        const winner = classified[0];
        const props = (winner.feature.properties ?? {}) as Record<string, unknown>;
        const name = (props.name ?? props.Name ?? props.NAME ?? null) as string | null;

        useFeatureStore.getState().selectFeature({
          type: winner.type,
          sourceLayerId: winner.feature.layer!.id,
          name,
          coordinates: { lng: e.lngLat.lng, lat: e.lngLat.lat },
          properties: props,
        });
      });

      // Hover handler — pointer cursor
      map.on('mousemove', (e) => {
        const queryLayers = getQueryableLayers(
          roadLayerIdsRef.current,
          buildingLayerIdsRef.current,
        ).filter((id) => map.getLayer(id));

        if (queryLayers.length === 0) {
          map.getCanvas().style.cursor = '';
          return;
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: queryLayers,
        });
        map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
      });
    });

    mapRef.current = map;

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  // Sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
  }, [layers]);

  // Sync 3D mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (is3D) {
      map.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
      addExtrusionLayer(map);
      map.setLight({ anchor: 'viewport', color: '#fff', intensity: 0.4 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      removeExtrusionLayer(map);
      map.setLight({ anchor: 'viewport', color: '#fff', intensity: 0 });
    }
  }, [is3D]);

  return (
    <Box
      ref={mapContainerRef}
      sx={{ width: '100%', height: '100%' }}
    />
  );
}

export default MapView;
