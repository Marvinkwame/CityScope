import { create } from 'zustand';

export interface GeoSearchResult {
  lng: number;
  lat: number;
  placeName: string;
}

interface GeoSearchState {
  result: GeoSearchResult | null;
  setResult: (r: GeoSearchResult | null) => void;
}

export const useGeoSearchStore = create<GeoSearchState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
}));
