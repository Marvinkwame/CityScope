import { ROLE } from '../theme';

export type LayerId = 'roads' | 'buildings' | 'districts' | 'heatmap';

export interface LayerConfig {
  id: LayerId;
  label: string;
  color: string;
}

export const LAYER_CONFIGS: LayerConfig[] = [
  // All four are context: the backdrop an analysis result sits on.
  { id: 'roads', label: 'Roads', color: ROLE.context },
  { id: 'buildings', label: 'Buildings', color: ROLE.context },
  { id: 'districts', label: 'Districts', color: ROLE.context },
  { id: 'heatmap', label: 'POI Heatmap', color: ROLE.context },
];

export const ROAD_LAYER_FILTER = (layerId: string): boolean =>
  layerId.startsWith('road') ||
  layerId.startsWith('bridge') ||
  layerId.startsWith('tunnel');

export const BUILDING_LAYER_FILTER = (layerId: string): boolean =>
  layerId.startsWith('building');

export const BUILDING_EXTRUSION_LAYER_ID = 'building-3d-extrusion';

export const DISTRICT_SOURCE_ID = 'city-districts';
export const DISTRICT_FILL_LAYER_ID = 'city-districts-fill';
export const DISTRICT_LINE_LAYER_ID = 'city-districts-line';
export const DISTRICT_SELECTED_LAYER_ID = 'city-districts-selected';

export const POI_HEATMAP_SOURCE_ID = 'pois-heatmap';
export const POI_HEATMAP_LAYER_ID = 'pois-heatmap-layer';

export const ISOCHRONE_SOURCE_ID = 'isochrone-source';
export const ISOCHRONE_FILL_LAYER_ID = 'isochrone-fill';
export const ISOCHRONE_LINE_LAYER_ID = 'isochrone-line';

export const ROUTE_SOURCE_ID = 'route-source';
export const ROUTE_LAYER_ID = 'route-layer';

export const FEATURE_TYPE_PRIORITY: Record<LayerId, number> = {
  buildings: 0,
  roads: 1,
  districts: 2,
  heatmap: 3,
};

export function classifyLayerId(layerId: string): LayerId | null {
  if (layerId === DISTRICT_FILL_LAYER_ID || layerId === DISTRICT_LINE_LAYER_ID) {
    return 'districts';
  }
  if (BUILDING_LAYER_FILTER(layerId)) {
    return 'buildings';
  }
  if (ROAD_LAYER_FILTER(layerId)) {
    return 'roads';
  }
  return null;
}
