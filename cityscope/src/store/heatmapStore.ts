import { create } from 'zustand';

interface HeatmapState {
  clickOrigin: { lng: number; lat: number } | null;
  setClickOrigin: (origin: { lng: number; lat: number } | null) => void;
}

export const useHeatmapStore = create<HeatmapState>((set) => ({
  clickOrigin: null,
  setClickOrigin: (origin) => set({ clickOrigin: origin }),
}));
