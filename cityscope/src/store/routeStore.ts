import { create } from 'zustand';
import type { TravelProfile } from './isochroneStore';

export type SetMode = 'origin' | 'destination';

interface RouteState {
  enabled: boolean;
  setMode: SetMode;
  origin: { lng: number; lat: number } | null;
  destination: { lng: number; lat: number } | null;
  profile: TravelProfile;
  setEnabled: (v: boolean) => void;
  setSetMode: (mode: SetMode) => void;
  setOrigin: (pt: { lng: number; lat: number } | null) => void;
  setDestination: (pt: { lng: number; lat: number } | null) => void;
  setProfile: (profile: TravelProfile) => void;
  reset: () => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  enabled: false,
  setMode: 'origin',
  origin: null,
  destination: null,
  profile: 'walking',

  setEnabled: (v) => {
    if (!v) get().reset();
    set({ enabled: v });
  },
  setSetMode: (mode) => set({ setMode: mode }),
  setOrigin: (pt) => set({ origin: pt }),
  setDestination: (pt) => set({ destination: pt }),
  setProfile: (profile) => set({ profile }),
  reset: () => set({ origin: null, destination: null, setMode: 'origin' }),
}));
