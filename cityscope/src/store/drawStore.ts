import { create } from 'zustand';

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

interface DrawState {
  enabled: boolean;
  polygon: PolygonGeometry | null;
  setEnabled: (enabled: boolean) => void;
  setPolygon: (polygon: PolygonGeometry | null) => void;
  reset: () => void;
}

export const useDrawStore = create<DrawState>((set, get) => ({
  enabled: false,
  polygon: null,
  setEnabled: (enabled) => {
    if (!enabled) get().reset();
    set({ enabled });
  },
  setPolygon: (polygon) => set({ polygon }),
  reset: () => set({ polygon: null }),
}));
