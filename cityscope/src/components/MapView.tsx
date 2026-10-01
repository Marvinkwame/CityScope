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
import { useRouteStore } from '../store/routeStore';
import { useGeoSearchStore } from '../store/geoSearchStore';
import { isHydrating } from '../lib/shareState';
import { hasCompletePolygon } from '../lib/drawFeatures';
import { heatmapWeight } from '../lib/heatmapExposure';
import { answerBeforeId, contextBeforeId } from '../lib/layerOrder';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useDrawStore } from '../store/drawStore';
import type { PolygonGeometry } from '../store/drawStore';
import { createPin } from '../lib/mapPins';
import { DRAW_STYLES } from '../constants/drawStyles';
import { useRoute } from '../hooks/useRoute';
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
  DISTRICT_SELECTED_LAYER_ID,
  POI_HEATMAP_SOURCE_ID,
  POI_HEATMAP_LAYER_ID,
  ISOCHRONE_SOURCE_ID,
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  ROUTE_SOURCE_ID,
  ROUTE_LAYER_ID,
  FEATURE_TYPE_PRIORITY,
  classifyLayerId,
} from '../constants/layerConfig';
import type { LayerId } from '../constants/layerConfig';
import { INK, ROLE, SURFACE, heatmapColorExpression } from '../theme';

/**
 * Recolour the dark-v11 basemap's blue-cast base layers to graphite so the
 * canvas shares a world with the graphite UI chrome. Guarded per-layer so a
 * future style change can never throw. Roads / labels keep their own colours.
 */
const BASEMAP_TINT = {
  background: INK,
  land: SURFACE.land,
  water: SURFACE.water,
};

function neutralizeBasemap(map: mapboxgl.Map) {
  const layers = map.getStyle().layers ?? [];
  layers.forEach((l) => {
    try {
      if (l.type === 'background') {
        map.setPaintProperty(l.id, 'background-color', BASEMAP_TINT.background);
      } else if (l.type === 'fill' && /water/i.test(l.id)) {
        map.setPaintProperty(l.id, 'fill-color', BASEMAP_TINT.water);
      } else if (l.type === 'fill' && /(^land$|landuse|landcover|national[-_]?park)/i.test(l.id)) {
        map.setPaintProperty(l.id, 'fill-color', BASEMAP_TINT.land);
      }
    } catch {
      /* layer absent or not paintable — ignore */
    }
  });
}

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
    [DISTRICT_FILL_LAYER_ID, DISTRICT_LINE_LAYER_ID, DISTRICT_SELECTED_LAYER_ID],
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
      'fill-extrusion-color': SURFACE.extrusion,
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

  // Context sits beneath any analysis result already on the map.
  const beforeId = contextBeforeId(map.getStyle().layers);

  map.addLayer(
    {
      id: DISTRICT_FILL_LAYER_ID,
      type: 'fill',
      source: DISTRICT_SOURCE_ID,
      paint: {
        // Invisible but required: this is the layer queryRenderedFeatures hits
        // to make districts clickable. Removing it would silently break selection.
        'fill-color': ROLE.context,
        'fill-opacity': 0,
      },
      layout: {
        visibility: 'none',
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: DISTRICT_LINE_LAYER_ID,
      type: 'line',
      source: DISTRICT_SOURCE_ID,
      paint: {
        'line-color': ROLE.context,
        'line-width': 1,
        'line-opacity': 0.3,
        'line-dasharray': [2, 2],
      },
      layout: {
        visibility: 'none',
      },
    },
    beforeId,
  );

  // The district the user clicked, outlined in the "you" colour. Starts
  // matching nothing; the selection effect updates the filter. No beforeId:
  // "you" layers stay on top of context and answer layers.
  map.addLayer({
    id: DISTRICT_SELECTED_LAYER_ID,
    type: 'line',
    source: DISTRICT_SOURCE_ID,
    filter: ['==', ['id'], -1],
    paint: {
      'line-color': ROLE.you,
      'line-width': 2.5,
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
  const routeOriginMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const routeDestinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const geoSearchMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const layers = useLayerStore((state) => state.layers);
  const is3D = useMapStore((state) => state.is3D);
  const selectedCity = useCityStore((state) => state.selectedCity);
  const isochroneEnabled = useIsochroneStore((state) => state.enabled);
  const isochroneOrigin = useIsochroneStore((state) => state.origin);
  const routeEnabled = useRouteStore((s) => s.enabled);
  const drawEnabled = useDrawStore((s) => s.enabled);
  const drawPolygon = useDrawStore((s) => s.polygon);
  const drawClearSignal = useDrawStore((s) => s.clearSignal);
  const routeOrigin = useRouteStore((s) => s.origin);
  const routeDestination = useRouteStore((s) => s.destination);
  const { data: routeData } = useRoute();
  const { data: districtsData } = useDistricts();
  const { data: poisData } = usePois();
  const { data: isochroneData } = useIsochrone();
  const geoSearchResult = useGeoSearchStore((s) => s.result);
  const selectedFeature = useFeatureStore((s) => s.selectedFeature);

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

    interface DrawChangeEvent {
      features: Array<{ id?: string | number; geometry: { type: string; coordinates: number[][][] } }>;
    }
    const readPolygon = (e: DrawChangeEvent) => {
      const geom = e.features[0]?.geometry;
      if (geom && geom.type === 'Polygon') {
        useDrawStore.getState().setPolygon(geom as PolygonGeometry);
      }
    };
    // Re-arm polygon-drawing so the user can immediately draw another shape
    // without re-clicking the toolbar. Deferred so it doesn't clash with
    // mapbox-gl-draw's own mode switch after a shape completes. (The built-in
    // trash button is disabled in this tool; clearing is done via the panel.)
    const reenterDrawMode = () => {
      setTimeout(() => {
        if (drawRef.current && useDrawStore.getState().enabled) {
          drawRef.current.changeMode('draw_polygon');
        }
      }, 0);
    };
    const handleDrawCreate = (e: DrawChangeEvent) => {
      const draw = drawRef.current;
      const created = e.features[0];
      if (draw && created) {
        draw.getAll().features.forEach((f) => {
          if (f.id !== created.id && f.id != null) draw.delete(String(f.id));
        });
      }
      readPolygon(e);
      reenterDrawMode();
    };
    const handleDrawDelete = () => {
      useDrawStore.getState().setPolygon(null);
      reenterDrawMode();
    };
    map.on('draw.create' as never, handleDrawCreate as never);
    map.on('draw.update' as never, readPolygon as never);
    map.on('draw.delete' as never, handleDrawDelete as never);

    map.on('style.load', () => {
      neutralizeBasemap(map);

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
        if (useDrawStore.getState().enabled) return;

        // Isochrone mode intercepts all clicks
        if (useIsochroneStore.getState().enabled) {
          useIsochroneStore.getState().setOrigin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
          return;
        }

        // Route mode intercepts all clicks — set A or B pin
        if (useRouteStore.getState().enabled) {
          const rs = useRouteStore.getState();
          if (rs.setMode === 'origin') {
            rs.setOrigin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
            rs.setSetMode('destination');
          } else {
            rs.setDestination({ lng: e.lngLat.lng, lat: e.lngLat.lat });
          }
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
          featureId: winner.feature.id,
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

        // Route mode uses crosshair cursor (pin-placement mode)
        if (useRouteStore.getState().enabled) {
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
      routeOriginMarkerRef.current?.remove();
      routeOriginMarkerRef.current = null;
      routeDestinationMarkerRef.current?.remove();
      routeDestinationMarkerRef.current = null;
      geoSearchMarkerRef.current?.remove();
      geoSearchMarkerRef.current = null;
      useMapStore.getState().setMap(null);
      if (drawRef.current && mapRef.current?.hasControl(drawRef.current)) {
        mapRef.current.removeControl(drawRef.current);
      }
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Fly to city on change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (isHydrating()) return;

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
    useRouteStore.getState().reset();
    useGeoSearchStore.getState().setResult(null);
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

  // Outline the selected district. Depends on districtsData so it re-runs once
  // the layer exists; any non-district selection resets the filter to nothing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(DISTRICT_SELECTED_LAYER_ID)) return;
    const id =
      selectedFeature?.type === 'districts' && selectedFeature.featureId != null
        ? selectedFeature.featureId
        : -1;
    map.setFilter(DISTRICT_SELECTED_LAYER_ID, ['==', ['id'], id]);
  }, [selectedFeature, mapReady, districtsData]);

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

    // The legend's Low/Medium/High is relative to the city, so exposure is too.
    const weight = heatmapWeight(poisData);

    const source = map.getSource(POI_HEATMAP_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
      map.setPaintProperty(POI_HEATMAP_LAYER_ID, 'heatmap-weight', weight);
    } else {
      map.addSource(POI_HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });

      map.addLayer(
        {
          id: POI_HEATMAP_LAYER_ID,
          type: 'heatmap',
          source: POI_HEATMAP_SOURCE_ID,
          layout: {
            visibility: useLayerStore.getState().layers.heatmap ? 'visible' : 'none',
          },
          paint: {
            'heatmap-weight': weight,
            // Zooming out one level packs about 4x the points into each pixel, so
            // intensity has to fall steeply as zoom falls, or the city centre
            // clips to a solid sheet.
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.05, 10, 0.15, 11, 0.4, 12.5, 0.8, 14, 1.4],
            'heatmap-color': heatmapColorExpression(),
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 12.5, 10, 15, 18],
            'heatmap-opacity': 0.9,
          },
        },
        // Context sits beneath any analysis result already on the map.
        contextBeforeId(map.getStyle().layers),
      );
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
      // Above context layers, below the basemap labels (see lib/layerOrder.ts)
      const beforeId = answerBeforeId(map.getStyle().layers);

      map.addSource(ISOCHRONE_SOURCE_ID, { type: 'geojson', data: isochroneData });

      map.addLayer(
        {
          id: ISOCHRONE_FILL_LAYER_ID,
          type: 'fill',
          source: ISOCHRONE_SOURCE_ID,
          paint: {
            // One hue; bands differ only by opacity, fading outward.
            'fill-color': ROLE.answer,
            'fill-opacity': ['interpolate', ['linear'], ['get', 'contour'], 5, 0.3, 30, 0.08],
          },
        },
        beforeId,
      );

      map.addLayer(
        {
          id: ISOCHRONE_LINE_LAYER_ID,
          type: 'line',
          source: ISOCHRONE_SOURCE_ID,
          paint: {
            'line-color': ROLE.answer,
            'line-width': 1.5,
            'line-opacity': 0.55,
          },
        },
        beforeId,
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
      isochroneMarkerRef.current = new mapboxgl.Marker({ element: createPin('origin') })
        .setLngLat([isochroneOrigin.lng, isochroneOrigin.lat])
        .addTo(map);
    }
  }, [isochroneOrigin, isochroneEnabled, mapReady]);

  // Sync route line layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!routeEnabled || !routeData || !routeOrigin || !routeDestination) {
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      return;
    }

    const routeFeature: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      geometry: routeData.geometry,
      properties: {},
    };

    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(routeFeature);
    } else {
      const beforeId = answerBeforeId(map.getStyle().layers);
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: routeFeature });
      map.addLayer(
        {
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROLE.answer,
            'line-width': 4,
            'line-opacity': 0.9,
          },
        },
        beforeId,
      );
    }
  }, [routeData, routeEnabled, routeOrigin, routeDestination, mapReady]);

  // Sync route origin and destination markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Origin marker (A)
    routeOriginMarkerRef.current?.remove();
    routeOriginMarkerRef.current = null;
    if (routeOrigin && routeEnabled) {
      routeOriginMarkerRef.current = new mapboxgl.Marker({ element: createPin('a') })
        .setLngLat([routeOrigin.lng, routeOrigin.lat])
        .addTo(map);
    }

    // Destination marker (B)
    routeDestinationMarkerRef.current?.remove();
    routeDestinationMarkerRef.current = null;
    if (routeDestination && routeEnabled) {
      routeDestinationMarkerRef.current = new mapboxgl.Marker({ element: createPin('b') })
        .setLngLat([routeDestination.lng, routeDestination.lat])
        .addTo(map);
    }
  }, [routeOrigin, routeDestination, routeEnabled, mapReady]);

  // Sync geo search pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    geoSearchMarkerRef.current?.remove();
    geoSearchMarkerRef.current = null;

    if (geoSearchResult) {
      geoSearchMarkerRef.current = new mapboxgl.Marker({ element: createPin('search') })
        .setLngLat([geoSearchResult.lng, geoSearchResult.lat])
        .addTo(map);
    }
  }, [geoSearchResult, mapReady]);

  // Toggle the polygon-draw control on/off
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (drawEnabled) {
      if (!drawRef.current) {
        drawRef.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: { polygon: true, trash: false },
          styles: DRAW_STYLES,
        });
      }
      if (!map.hasControl(drawRef.current)) {
        map.addControl(drawRef.current, 'top-right');
      }
      drawRef.current.changeMode('draw_polygon');
    } else if (drawRef.current && map.hasControl(drawRef.current)) {
      map.removeControl(drawRef.current);
      useDrawStore.getState().setPolygon(null);
    }
  }, [drawEnabled, mapReady]);

  // Render a polygon that arrived from a shared URL (draw control has no feature yet).
  // `mapReady` must stay in the deps: hydration usually lands BEFORE style.load,
  // because the city list is a fast API call while mapReady waits on Mapbox's
  // style over the network. At that point the draw-toggle effect above has
  // bailed too, so drawRef.current is still null and this effect returns early.
  // Without mapReady it would never re-run — neither store value changes again —
  // leaving the shape invisible while the sidebar shows results for it.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !drawEnabled || !drawPolygon) return;
    // Only bail for a polygon the user actually finished. A plain
    // `features.length > 0` check counts the in-progress stub that
    // changeMode('draw_polygon') inserts the moment the tool is armed, which
    // meant a shared polygon was never added at all.
    if (hasCompletePolygon(draw.getAll().features)) return;
    draw.add({ type: 'Feature', properties: {}, geometry: drawPolygon });
    // Leaves draw_polygon mode, which discards gl-draw's in-progress stub and
    // leaves only the shape restored from the link.
    draw.changeMode('simple_select');
  }, [drawEnabled, drawPolygon, mapReady]);

  // Panel "Clear area" button: erase the drawn shape, clear results, re-arm draw
  useEffect(() => {
    if (drawClearSignal === 0) return;
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    useDrawStore.getState().setPolygon(null);
    if (useDrawStore.getState().enabled) draw.changeMode('draw_polygon');
  }, [drawClearSignal]);

  return (
    <Box
      ref={mapContainerRef}
      sx={{ width: '100%', height: '100%' }}
    />
  );
}

export default MapView;
