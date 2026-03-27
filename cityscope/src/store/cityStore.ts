import { create } from 'zustand';

export interface City {
  id: string;
  name: string;
  country: string;
  centerLng: number;
  centerLat: number;
  defaultZoom: number;
  bounds: { south: number; west: number; north: number; east: number } | null;
}

interface CityState {
  selectedCity: City;
  setCity: (city: City) => void;
}

const DEFAULT_CITY: City = {
  id: 'berlin',
  name: 'Berlin',
  country: 'Germany',
  centerLng: 13.405,
  centerLat: 52.52,
  defaultZoom: 12,
  bounds: null,
};

export const useCityStore = create<CityState>((set) => ({
  selectedCity: DEFAULT_CITY,
  setCity: (city) => set({ selectedCity: city }),
}));
