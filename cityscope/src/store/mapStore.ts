import { create } from 'zustand';

interface MapState {
  is3D: boolean;
  toggle3D: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  is3D: false,
  toggle3D: () => set((state) => ({ is3D: !state.is3D })),
}));
 