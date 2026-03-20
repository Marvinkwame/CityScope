export type LayerId = 'roads' | 'buildings' | 'districts';

export interface LayerConfig {
  id: LayerId;
  label: string;
  color: string;
}

export const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'roads', label: 'Roads', color: '#FFB74D' },
  { id: 'buildings', label: 'Buildings', color: '#90CAF9' },
  { id: 'districts', label: 'Districts', color: '#CE93D8' },
];

export const ROAD_LAYER_FILTER = (layerId: string): boolean =>
  layerId.startsWith('road') ||
  layerId.startsWith('bridge') ||
  layerId.startsWith('tunnel');

export const BUILDING_LAYER_FILTER = (layerId: string): boolean =>
  layerId.startsWith('building');

export const DISTRICT_SOURCE_ID = 'berlin-districts';
export const DISTRICT_FILL_LAYER_ID = 'berlin-districts-fill';
export const DISTRICT_LINE_LAYER_ID = 'berlin-districts-line';
