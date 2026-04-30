import { create } from 'zustand';
import type { Map as MapboxMap } from 'mapbox-gl';

interface MapState {
  is3D: boolean;
  toggle3D: () => void;
  map: MapboxMap | null;
  setMap: (map: MapboxMap | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  is3D: false,
  toggle3D: () => set((state) => ({ is3D: !state.is3D })),
  map: null,
  setMap: (map) => set({ map }),
}));
