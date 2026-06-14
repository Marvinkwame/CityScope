import { create } from 'zustand';

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

interface DrawState {
  enabled: boolean;
  polygon: PolygonGeometry | null;
  /** Incremented to ask MapView to erase the drawn shape (panel "Clear" button). */
  clearSignal: number;
  setEnabled: (enabled: boolean) => void;
  setPolygon: (polygon: PolygonGeometry | null) => void;
  requestClear: () => void;
  reset: () => void;
}

export const useDrawStore = create<DrawState>((set, get) => ({
  enabled: false,
  polygon: null,
  clearSignal: 0,
  setEnabled: (enabled) => {
    if (!enabled) get().reset();
    set({ enabled });
  },
  setPolygon: (polygon) => set({ polygon }),
  requestClear: () => set((s) => ({ clearSignal: s.clearSignal + 1 })),
  reset: () => set({ polygon: null }),
}));
