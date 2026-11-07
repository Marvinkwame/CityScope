import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { ExpressionSpecification } from 'mapbox-gl';
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
import { useReachStore } from '../store/reachStore';
import { resetForCityChange } from '../lib/cityChange';
import { isHydrating } from '../lib/shareState';
import { showsPolygon } from '../lib/drawFeatures';
import { heatmapPoints, heatmapWeight } from '../lib/heatmapExposure';
import { answerBeforeId, contextBeforeId, reachBeforeId } from '../lib/layerOrder';
import { REACH_RECOLOUR } from '../lib/reach/config';
import {
  MISSING_FROM_STATE,
  missingCountExpression,
  reachColourExpression,
  reachExtrusionColourExpression,
  reachHeightExpression,
} from '../lib/reach/expressions';
import { reachLayerVisibility } from '../lib/reach/layerVisibility';
import { cellCentre, linkLines } from '../lib/reach/card';
import { changedBlocks, missingClasses } from '../lib/reach/summary';
import type { NeedId, ReachPayload } from '../lib/reach/model';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useDrawStore } from '../store/drawStore';
import type { PolygonGeometry } from '../store/drawStore';
import { createCategoryPin, createPin } from '../lib/mapPins';
import { DRAW_STYLES } from '../constants/drawStyles';
import { useRoute } from '../hooks/useRoute';
import { useDistricts } from '../hooks/useDistricts';
import { usePois } from '../hooks/usePois';
import { useIsochrone } from '../hooks/useIsochrone';
import { useReachPayload } from '../hooks/useReachPayload';
import { useReachSummary } from '../hooks/useReachSummary';
import { useReachCard } from '../hooks/useReachCard';
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
  REACH_SOURCE_ID,
  REACH_FILL_LAYER_ID,
  REACH_EXTRUSION_LAYER_ID,
  REACH_SELECTED_SOURCE_ID,
  REACH_SELECTED_CASING_LAYER_ID,
  REACH_SELECTED_LAYER_ID,
  REACH_LINKS_SOURCE_ID,
  REACH_LINKS_LAYER_ID,
  FEATURE_TYPE_PRIORITY,
  classifyLayerId,
} from '../constants/layerConfig';
import type { LayerId } from '../constants/layerConfig';
import {
  INK,
  REACH_FILL_OPACITY,
  REACH_SELECTION,
  ROLE,
  SURFACE,
  heatmapColorExpression,
} from '../theme';

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

/**
 * The 3D buildings hide while everyday reach is on, so its columns stand alone.
 * That follows the switch alone, so the payload's readiness, which a store read
 * cannot see, doesn't matter here.
 */
function reachHidesBuildings(): boolean {
  return reachLayerVisibility({
    enabled: useReachStore.getState().enabled,
    ready: false,
    is3D: useMapStore.getState().is3D,
  }).hideBuildingExtrusion;
}

function applyLayerVisibility(
  map: mapboxgl.Map,
  roadLayerIds: string[],
  buildingLayerIds: string[],
) {
  const currentLayers = useLayerStore.getState().layers;
  setLayerVisibility(map, roadLayerIds, currentLayers.roads);
  setLayerVisibility(map, buildingLayerIds, currentLayers.buildings);
  setLayerVisibility(
    map,
    [BUILDING_EXTRUSION_LAYER_ID],
    currentLayers.buildings && !reachHidesBuildings(),
  );
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
  if (!buildingsVisible || reachHidesBuildings()) {
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
        // A faint wash so the districts read as areas. Required either way:
        // this is the layer queryRenderedFeatures hits to make districts
        // clickable. Removing it would silently break selection.
        'fill-color': ROLE.context,
        'fill-opacity': 0.05,
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
        // Solid and fairly bright: a thinner dashed line at 0.3 was hard to
        // tell apart from roads at city zoom, so the layer looked switched off.
        'line-color': ROLE.context,
        'line-width': 1.5,
        'line-opacity': 0.6,
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

const REACH_ATTRIBUTION = 'Population: GHSL, European Commission JRC (CC BY 4.0)';

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * The per-block count of chosen needs out of reach, which the block colours
 * step on: read from feature state, which a recolour rewrites block by block, or
 * worked out by Mapbox from each block's metres, which a recolour replaces as a
 * paint property (see `REACH_RECOLOUR`).
 */
function reachMissing(needs: readonly NeedId[], minutes: number, k: number): ExpressionSpecification {
  return REACH_RECOLOUR === 'feature-state'
    ? MISSING_FROM_STATE
    : missingCountExpression(needs, minutes, k);
}

/** The reach block layers a click or hover can hit: those on the map and showing. */
function visibleReachLayers(map: mapboxgl.Map): string[] {
  return [REACH_FILL_LAYER_ID, REACH_EXTRUSION_LAYER_ID].filter(
    (id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none',
  );
}

/** What the reach blocks' colours were last worked out for. */
interface ReachColouredFor {
  payload: ReachPayload;
  needs: readonly NeedId[];
  minutes: number;
  k: number;
  /** Each block's class as written to feature state; null on the expression path. */
  classes: Uint8Array | null;
}

/**
 * The payload as the reach source's data: each block's feature id is its index
 * in `payload.features`, which feature state needs. Mapbox would hash an H3 id
 * (a string) to a 32-bit id, so two blocks could share their state; an index
 * never does. Each feature is a shallow copy, so the cached payload is never
 * changed.
 */
function reachSourceData(payload: ReachPayload): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: payload.features.map((f, i) => ({ ...f, id: i })) };
}

/** Each block's index in `payload.features` (its feature id), by H3 id. */
function reachIndexByCell(payload: ReachPayload | undefined): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  payload?.features.forEach((f, i) => index.set(f.properties.h, i));
  return index;
}

function addReachLayers(map: mapboxgl.Map, data: GeoJSON.FeatureCollection, k: number) {
  if (map.getSource(REACH_SOURCE_ID)) return;

  // The data carries numeric feature ids (see reachSourceData). The
  // attribution shows only while a layer on this source is visible.
  map.addSource(REACH_SOURCE_ID, {
    type: 'geojson',
    data,
    attribution: REACH_ATTRIBUTION,
  });

  // Beneath the district outlines and any analysis result (see lib/layerOrder.ts).
  const beforeId = reachBeforeId(map.getStyle().layers);
  const { needs, minutes } = useReachStore.getState();
  const missing = reachMissing(needs, minutes, k);

  map.addLayer(
    {
      id: REACH_FILL_LAYER_ID,
      type: 'fill',
      source: REACH_SOURCE_ID,
      paint: {
        'fill-color': reachColourExpression(missing),
        'fill-opacity': REACH_FILL_OPACITY,
        // Antialiased edges show as hairline seams between neighbouring hexagons.
        'fill-antialias': false,
      },
      layout: {
        visibility: 'none',
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: REACH_EXTRUSION_LAYER_ID,
      type: 'fill-extrusion',
      source: REACH_SOURCE_ID,
      paint: {
        // Gold while selected, read from feature state, so a selection never
        // touches the paint.
        'fill-extrusion-color': reachExtrusionColourExpression(missing),
        'fill-extrusion-height': reachHeightExpression(),
        'fill-extrusion-opacity': 0.9,
      },
      layout: {
        visibility: 'none',
      },
    },
    beforeId,
  );

  // The selected block's outline, a gold line on a dark casing, on a one-block
  // source of its own so a selection never reloads the blocks' tiles. No
  // beforeId: "you" layers stay on top.
  map.addSource(REACH_SELECTED_SOURCE_ID, { type: 'geojson', data: EMPTY_COLLECTION });

  map.addLayer({
    id: REACH_SELECTED_CASING_LAYER_ID,
    type: 'line',
    source: REACH_SELECTED_SOURCE_ID,
    paint: {
      'line-color': REACH_SELECTION.casing,
      'line-width': 5,
    },
    layout: {
      visibility: 'none',
    },
  });

  map.addLayer({
    id: REACH_SELECTED_LAYER_ID,
    type: 'line',
    source: REACH_SELECTED_SOURCE_ID,
    paint: {
      'line-color': REACH_SELECTION.line,
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
  // The feature id (index) of the block that carries the `selected` feature
  // state, so the next selection can clear it.
  const reachSelectedIdRef = useRef<number | null>(null);
  // The payload the reach source holds, and what its colours were worked out
  // for, so turning reach back on redoes neither when nothing changed meanwhile.
  const reachSourcePayloadRef = useRef<ReachPayload | null>(null);
  const reachColouredForRef = useRef<ReachColouredFor | null>(null);
  // The category pins at the ends of the block's lines, each with its root's disposer.
  const reachPinsRef = useRef<Array<{ marker: mapboxgl.Marker; dispose: () => void }>>([]);
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
  const reachEnabled = useReachStore((s) => s.enabled);
  const reachMinutes = useReachStore((s) => s.minutes);
  const reachNeeds = useReachStore((s) => s.needs);
  const reachSelectedCell = useReachStore((s) => s.selectedCell);
  const { data: reachPayload, availability: reachAvailability } = useReachPayload();
  const reachReady = reachAvailability === 'ready';
  const reachSummary = useReachSummary();
  const reachColumns = reachSummary?.columns;
  const reachK = reachSummary?.meta.metresPerMinute;
  const { data: reachCard } = useReachCard();
  // Once per payload: the source's data with numeric ids, and each block's id by H3 id.
  const reachSource = useMemo(() => (reachPayload ? reachSourceData(reachPayload) : null), [reachPayload]);
  const reachIndex = useMemo(() => reachIndexByCell(reachPayload), [reachPayload]);

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

        // Everyday reach intercepts all clicks: select the block under the
        // pointer, and a click off every block clears the selection
        if (useReachStore.getState().enabled) {
          const reachLayers = visibleReachLayers(map);
          const block =
            reachLayers.length > 0
              ? map.queryRenderedFeatures(e.point, { layers: reachLayers })[0]
              : undefined;
          const cell: unknown = block?.properties?.h;
          useReachStore.getState().selectCell(typeof cell === 'string' ? cell : null);
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

        // Everyday reach: pointer over a block, the default cursor elsewhere
        if (useReachStore.getState().enabled) {
          const reachLayers = visibleReachLayers(map);
          const overBlock =
            reachLayers.length > 0 &&
            map.queryRenderedFeatures(e.point, { layers: reachLayers }).length > 0;
          map.getCanvas().style.cursor = overBlock ? 'pointer' : '';
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
      reachSelectedIdRef.current = null;
      reachSourcePayloadRef.current = null;
      reachColouredForRef.current = null;
      reachPinsRef.current.forEach(({ marker, dispose }) => {
        marker.remove();
        dispose();
      });
      reachPinsRef.current = [];
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

    resetForCityChange();
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

    // The everyday-needs categories are for the place lists, not the heatmap.
    const points = heatmapPoints(poisData);

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: points.map((poi) => ({
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
    const weight = heatmapWeight(points);

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

  // Sync layer visibility. Re-runs on the reach switch too, which hides the 3D
  // buildings while it is on and brings them back when it goes off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
    if (!layers.heatmap) {
      useHeatmapStore.getState().setClickOrigin(null);
    }
  }, [layers, reachEnabled, mapReady]);

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

  // Everyday reach: add the blocks and the selected-block outline once a payload
  // is there, or swap in a new city's blocks. Only while reach is on: a city
  // change while it is off posts nothing to the worker, and the swap happens
  // when it is next turned on. Every layer starts hidden; the visibility effect
  // below shows them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !reachEnabled || !reachPayload || !reachSource) return;
    if (reachSourcePayloadRef.current === reachPayload) return;

    const source = map.getSource(REACH_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      // The two effects below, keyed on the payload too, give the new city's
      // blocks their colours and move the selection.
      source.setData(reachSource);
    } else {
      addReachLayers(map, reachSource, reachPayload.meta.metresPerMinute);
    }
    reachSourcePayloadRef.current = reachPayload;
  }, [reachPayload, reachSource, reachEnabled, mapReady]);

  // Recolour the blocks for the chosen time and needs, a new payload or its
  // speed k, while reach is on. Never on a selection change: either path
  // restyles every block. Runs after the effect above, so the source exists.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !reachEnabled || !reachPayload || !reachColumns || reachK === undefined) return;
    if (!map.getSource(REACH_SOURCE_ID)) return;
    const last = reachColouredForRef.current;
    if (
      last &&
      last.payload === reachPayload &&
      last.needs === reachNeeds &&
      last.minutes === reachMinutes &&
      last.k === reachK
    ) {
      return;
    }

    let classes: Uint8Array | null = null;
    if (REACH_RECOLOUR === 'feature-state') {
      // Feature state restyles without reloading tiles, but Mapbox re-evaluates
      // the paint of every block whose state is set, so only the blocks whose
      // colour class changed are written. The classes follow the payload's
      // block order, and block i's feature id is i. A new city's blocks are all
      // written, which overwrites a previous city's states on the same ids.
      classes = missingClasses(reachColumns, reachNeeds, reachMinutes, reachK);
      const previous = last?.payload === reachPayload ? last.classes : null;
      for (const i of changedBlocks(previous, classes)) {
        map.setFeatureState({ source: REACH_SOURCE_ID, id: i }, { missing: classes[i] });
      }
    } else {
      // A data-driven paint change reloads every tile of the source. Mapbox
      // skips an unchanged value, so the first run after creation costs nothing.
      const missing = missingCountExpression(reachNeeds, reachMinutes, reachK);
      map.setPaintProperty(REACH_FILL_LAYER_ID, 'fill-color', reachColourExpression(missing));
      map.setPaintProperty(
        REACH_EXTRUSION_LAYER_ID,
        'fill-extrusion-color',
        reachExtrusionColourExpression(missing),
      );
    }
    reachColouredForRef.current = { payload: reachPayload, needs: reachNeeds, minutes: reachMinutes, k: reachK, classes };
  }, [reachPayload, reachColumns, reachNeeds, reachMinutes, reachK, reachEnabled, mapReady]);

  // Outline the selected block on its own one-block source, and turn its column
  // gold through feature state. Neither touches the blocks' filter or paint, so a
  // selection never reloads their tiles. A block missing from the payload (say,
  // from another city's link) selects nothing here.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const outline = map.getSource(REACH_SELECTED_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!outline) return;

    const index = reachSelectedCell ? reachIndex.get(reachSelectedCell) : undefined;
    // A selection the loaded payload doesn't list (another city's block, a stale
    // link) is dropped rather than left selected.
    if (reachSelectedCell && reachPayload && index === undefined) {
      useReachStore.getState().selectCell(null);
    }
    const feature = index === undefined ? undefined : reachPayload?.features[index];
    outline.setData(
      feature ? { type: 'FeatureCollection', features: [feature] } : EMPTY_COLLECTION,
    );

    const next = feature && index !== undefined ? index : null;
    const previous = reachSelectedIdRef.current;
    if (previous !== null && previous !== next) {
      map.removeFeatureState({ source: REACH_SOURCE_ID, id: previous }, 'selected');
    }
    if (next !== null) {
      map.setFeatureState({ source: REACH_SOURCE_ID, id: next }, { selected: true });
    }
    reachSelectedIdRef.current = next;
  }, [reachSelectedCell, reachPayload, reachIndex, mapReady]);

  // Show the reach layers for the switch, the payload and 3D: the flat fill in
  // 2D, the columns in 3D. Mapbox skips an unchanged visibility, so a re-run
  // reloads nothing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visible = reachLayerVisibility({ enabled: reachEnabled, ready: reachReady, is3D });
    setLayerVisibility(map, [REACH_FILL_LAYER_ID], visible.fill);
    setLayerVisibility(map, [REACH_EXTRUSION_LAYER_ID], visible.extrusion);
    setLayerVisibility(
      map,
      [REACH_SELECTED_CASING_LAYER_ID, REACH_SELECTED_LAYER_ID],
      visible.selection,
    );
  }, [reachEnabled, reachReady, is3D, mapReady]);

  // Lines from the selected block's centre to its nearest chosen places within
  // the limit. None while the card is loading or stale, or without a selection
  // (see `linkLines`). Memoised so the effects below only run on a real change.
  const reachLinks = useMemo(() => {
    if (!reachEnabled || !reachCard || !reachPayload || reachK === undefined) return null;
    const feature = reachPayload.features.find((f) => f.properties.h === reachSelectedCell);
    if (!feature || reachCard.cell !== feature.properties.h) return null;
    const centre = cellCentre(feature.geometry.coordinates[0]);
    return linkLines(reachCard, feature.properties, reachK, reachMinutes, reachNeeds, centre);
  }, [reachEnabled, reachCard, reachPayload, reachK, reachSelectedCell, reachMinutes, reachNeeds]);
  const linksVisible = reachLayerVisibility({ enabled: reachEnabled, ready: reachReady, is3D }).selection;

  // The dashed lines, drawn in the answer colour above the context layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const data = linksVisible && reachLinks ? reachLinks : EMPTY_COLLECTION;

    const source = map.getSource(REACH_LINKS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      map.addSource(REACH_LINKS_SOURCE_ID, { type: 'geojson', data });
      map.addLayer(
        {
          id: REACH_LINKS_LAYER_ID,
          type: 'line',
          source: REACH_LINKS_SOURCE_ID,
          paint: {
            'line-color': ROLE.answer,
            'line-width': 2,
            'line-dasharray': [2, 1],
          },
        },
        answerBeforeId(map.getStyle().layers),
      );
    }
  }, [reachLinks, linksVisible, mapReady]);

  // One category pin per line end, removed and disposed on every change and on unmount.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !linksVisible || !reachLinks) return;

    const pins = reachLinks.features.map((f) => {
      const { element, dispose } = createCategoryPin(String(f.properties?.category));
      const [lng, lat] = f.geometry.coordinates[1];
      const marker = new mapboxgl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
      return { marker, dispose };
    });
    reachPinsRef.current = pins;

    return () => {
      pins.forEach(({ marker, dispose }) => {
        marker.remove();
        dispose();
      });
      reachPinsRef.current = [];
    };
  }, [reachLinks, linksVisible, mapReady]);

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

  // Render the polygon from a share state (a link, or a welcome-card example
  // applied mid-session), replacing any different polygon gl-draw already shows.
  // `mapReady` must stay in the deps: hydration usually lands BEFORE style.load,
  // because the city list is a fast API call while mapReady waits on Mapbox's
  // style over the network. At that point the draw-toggle effect above has
  // bailed too, so drawRef.current is still null and this effect returns early.
  // Without mapReady it would never re-run — neither store value changes again —
  // leaving the shape invisible while the sidebar shows results for it.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !drawEnabled || !drawPolygon) return;
    // Bail only if gl-draw already shows THIS polygon. A different finished
    // polygon (say, the user's own drawing before they chose an example) must
    // be replaced, not kept. The in-progress stub that changeMode('draw_polygon')
    // inserts is never a match.
    if (showsPolygon(draw.getAll().features, drawPolygon)) return;
    draw.deleteAll();
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
