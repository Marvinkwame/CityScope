import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Box from '@mui/material/Box';
import { useLayerStore } from '../store/layerStore';
import { useFeatureStore } from '../store/featureStore';
import { useMapStore } from '../store/mapStore';
import { useCityStore } from '../store/cityStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useDistricts } from '../hooks/useDistricts';
import { usePois } from '../hooks/usePois';
import { useIsochrone } from '../hooks/useIsochrone';
import {
  ROAD_LAYER_FILTER,
  BUILDING_LAYER_FILTER,
  BUILDING_EXTRUSION_LAYER_ID,
  DISTRICT_SOURCE_ID,
  DISTRICT_FILL_LAYER_ID,
  DISTRICT_LINE_LAYER_ID,
  POI_HEATMAP_SOURCE_ID,
  POI_HEATMAP_LAYER_ID,
  ISOCHRONE_SOURCE_ID,
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  ISOCHRONE_COLOR,
  FEATURE_TYPE_PRIORITY,
  classifyLayerId,
} from '../constants/layerConfig';
import type { LayerId } from '../constants/layerConfig';

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
  setLayerVisibility(map, [BUILDING_EXTRUSION_LAYER_ID], currentLayers.buildings);
  setLayerVisibility(
    map,
    [DISTRICT_FILL_LAYER_ID, DISTRICT_LINE_LAYER_ID],
    currentLayers.districts,
  );
  setLayerVisibility(map, [POI_HEATMAP_LAYER_ID], currentLayers.heatmap);
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

function addDistrictLayers(map: mapboxgl.Map, data: GeoJSON.FeatureCollection) {
  if (map.getSource(DISTRICT_SOURCE_ID)) return;

  map.addSource(DISTRICT_SOURCE_ID, { type: 'geojson', data });

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

function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const roadLayerIdsRef = useRef<string[]>([]);
  const buildingLayerIdsRef = useRef<string[]>([]);
  const isInitialMountRef = useRef(true);
  const isochroneMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const layers = useLayerStore((state) => state.layers);
  const is3D = useMapStore((state) => state.is3D);
  const selectedCity = useCityStore((state) => state.selectedCity);
  const isochroneEnabled = useIsochroneStore((state) => state.enabled);
  const isochroneOrigin = useIsochroneStore((state) => state.origin);
  const { data: districtsData } = useDistricts();
  const { data: poisData } = usePois();
  const { data: isochroneData } = useIsochrone();

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const city = useCityStore.getState().selectedCity;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [city.centerLng, city.centerLat],
      zoom: city.defaultZoom,
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

      applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);

      if (useMapStore.getState().is3D) {
        addExtrusionLayer(map);
        map.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
        map.setLight({ anchor: 'viewport', color: '#fff', intensity: 0.4 });
      }

      setMapReady(true);

      // Click handler — select features
      map.on('click', (e) => {
        // Isochrone mode intercepts all clicks
        if (useIsochroneStore.getState().enabled) {
          useIsochroneStore.getState().setOrigin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
          return;
        }

        // Heatmap mode: record click origin for spotlight card (does not intercept)
        if (useLayerStore.getState().layers.heatmap) {
          useHeatmapStore.getState().setClickOrigin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        }

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
        // Isochrone mode uses crosshair cursor
        if (useIsochroneStore.getState().enabled) {
          map.getCanvas().style.cursor = 'crosshair';
          return;
        }

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
    useMapStore.getState().setMap(map);

    return () => {
      isochroneMarkerRef.current?.remove();
      isochroneMarkerRef.current = null;
      useMapStore.getState().setMap(null);
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Fly to city on change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    map.flyTo({
      center: [selectedCity.centerLng, selectedCity.centerLat],
      zoom: selectedCity.defaultZoom,
      duration: 2000,
      essential: true,
    });

    useFeatureStore.getState().clearFeature();
    useIsochroneStore.getState().reset();
    useHeatmapStore.getState().setClickOrigin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity.id, mapReady]);

  // Add district layers when both map and data are ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !districtsData) return;

    const source = map.getSource(DISTRICT_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(districtsData);
    } else {
      addDistrictLayers(map, districtsData);
      applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
    }
  }, [districtsData, mapReady]);

  // Add/update POI heatmap source and layer when data is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !poisData) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: poisData.map((poi) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [poi.lng, poi.lat],
        },
        properties: {
          name: poi.name,
          category: poi.category,
        },
      })),
    };

    const source = map.getSource(POI_HEATMAP_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      map.addSource(POI_HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });

      map.addLayer({
        id: POI_HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: POI_HEATMAP_SOURCE_ID,
        layout: {
          visibility: useLayerStore.getState().layers.heatmap ? 'visible' : 'none',
        },
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 22, 3],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(65,105,225,0)',
            0.2, 'rgb(65,105,225)',
            0.4, 'rgb(0,180,120)',
            0.6, 'rgb(255,255,0)',
            0.8, 'rgb(255,165,0)',
            1, 'rgb(255,0,0)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 15, 25],
          'heatmap-opacity': 0.7,
        },
      });
    }
  }, [poisData, mapReady]);

  // Sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
    if (!layers.heatmap) {
      useHeatmapStore.getState().setClickOrigin(null);
    }
  }, [layers, mapReady]);

  // Sync 3D mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (is3D) {
      map.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
      addExtrusionLayer(map);
      map.setLight({ anchor: 'viewport', color: '#fff', intensity: 0.4 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      removeExtrusionLayer(map);
      map.setLight({ anchor: 'viewport', color: '#fff', intensity: 0 });
    }
  }, [is3D, mapReady]);

  // Sync isochrone polygon layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!isochroneEnabled || !isochroneData) {
      // Remove layers and source when disabled or no data
      if (map.getLayer(ISOCHRONE_LINE_LAYER_ID)) map.removeLayer(ISOCHRONE_LINE_LAYER_ID);
      if (map.getLayer(ISOCHRONE_FILL_LAYER_ID)) map.removeLayer(ISOCHRONE_FILL_LAYER_ID);
      if (map.getSource(ISOCHRONE_SOURCE_ID)) map.removeSource(ISOCHRONE_SOURCE_ID);
      return;
    }

    const source = map.getSource(ISOCHRONE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(isochroneData);
    } else {
      // Find first road layer to insert isochrone below it
      const styleLayers = map.getStyle().layers;
      const firstRoadLayer = styleLayers.find((l) => ROAD_LAYER_FILTER(l.id));

      map.addSource(ISOCHRONE_SOURCE_ID, { type: 'geojson', data: isochroneData });

      map.addLayer(
        {
          id: ISOCHRONE_FILL_LAYER_ID,
          type: 'fill',
          source: ISOCHRONE_SOURCE_ID,
          paint: {
            'fill-color': [
              'step', ['get', 'contour'],
              '#00E5FF',      // ≤ 10 min: brightest cyan (innermost)
              11, '#00BCD4',  // 11–20 min: standard cyan
              21, '#0097A7',  // 21+ min: dark teal (outermost)
            ],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['get', 'contour'],
              5, 0.45,
              30, 0.08,
            ],
          },
        },
        firstRoadLayer?.id,
      );

      map.addLayer(
        {
          id: ISOCHRONE_LINE_LAYER_ID,
          type: 'line',
          source: ISOCHRONE_SOURCE_ID,
          paint: {
            'line-color': ISOCHRONE_COLOR,
            'line-width': 2,
            'line-opacity': 0.6,
          },
        },
        firstRoadLayer?.id,
      );
    }
  }, [isochroneData, isochroneEnabled, mapReady]);

  // Sync isochrone origin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove old marker
    if (isochroneMarkerRef.current) {
      isochroneMarkerRef.current.remove();
      isochroneMarkerRef.current = null;
    }

    if (isochroneOrigin && isochroneEnabled) {
      isochroneMarkerRef.current = new mapboxgl.Marker({ color: ISOCHRONE_COLOR })
        .setLngLat([isochroneOrigin.lng, isochroneOrigin.lat])
        .addTo(map);
    }
  }, [isochroneOrigin, isochroneEnabled, mapReady]);

  return (
    <Box
      ref={mapContainerRef}
      sx={{ width: '100%', height: '100%' }}
    />
  );
}

export default MapView;
