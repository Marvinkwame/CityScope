import { create } from 'zustand';
import type { LayerId } from '../constants/layerConfig';

interface LayerState {
  layers: Record<LayerId, boolean>;
  toggleLayer: (id: LayerId) => void;
  setLayers: (layers: Record<LayerId, boolean>) => void;
}

export const useLayerStore = create<LayerState>((set) => ({
  layers: {
    roads: true,
    buildings: true,
    districts: false,
    heatmap: false,
  },
  toggleLayer: (id) =>
    set((state) => ({
      layers: { ...state.layers, [id]: !state.layers[id] },
    })),
  setLayers: (layers) => set({ layers }),
}));
