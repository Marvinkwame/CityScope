import { create } from 'zustand';
import type { LayerId } from '../constants/layerConfig';

export interface SelectedFeature {
  type: LayerId;
  sourceLayerId: string;
  name: string | null;
  coordinates: { lng: number; lat: number };
  properties: Record<string, unknown>;
}

interface FeatureState {
  selectedFeature: SelectedFeature | null;
  selectFeature: (feature: SelectedFeature) => void;
  clearFeature: () => void;
}

export const useFeatureStore = create<FeatureState>((set) => ({
  selectedFeature: null,
  selectFeature: (feature) => set({ selectedFeature: feature }),
  clearFeature: () => set({ selectedFeature: null }),
}));
