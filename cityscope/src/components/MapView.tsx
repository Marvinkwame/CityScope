import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Box from '@mui/material/Box';
import { useLayerStore } from '../store/layerStore';
import {
  ROAD_LAYER_FILTER,
  BUILDING_LAYER_FILTER,
  DISTRICT_SOURCE_ID,
  DISTRICT_FILL_LAYER_ID,
  DISTRICT_LINE_LAYER_ID,
} from '../constants/layerConfig';

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
  setLayerVisibility(
    map,
    [DISTRICT_FILL_LAYER_ID, DISTRICT_LINE_LAYER_ID],
    currentLayers.districts,
  );
}

function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const roadLayerIdsRef = useRef<string[]>([]);
  const buildingLayerIdsRef = useRef<string[]>([]);

  const layers = useLayerStore((state) => state.layers);

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
        })
        .catch((err) => {
          console.warn('Failed to load district boundaries:', err);
          mapReadyRef.current = true;
          applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
        });
    });

    mapRef.current = map;

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    applyLayerVisibility(map, roadLayerIdsRef.current, buildingLayerIdsRef.current);
  }, [layers]);

  return (
    <Box
      ref={mapContainerRef}
      sx={{ width: '100%', height: '100%' }}
    />
  );
}

export default MapView;
