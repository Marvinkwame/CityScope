import { create } from 'zustand';

export type TravelProfile = 'walking' | 'cycling' | 'driving';

interface IsochroneState {
  enabled: boolean;
  profile: TravelProfile;
  contourMinutes: number[];
  origin: { lng: number; lat: number } | null;
  loading: boolean;
  error: string | null;
  setEnabled: (enabled: boolean) => void;
  setProfile: (profile: TravelProfile) => void;
  setContourMinutes: (minutes: number[]) => void;
  setOrigin: (origin: { lng: number; lat: number } | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useIsochroneStore = create<IsochroneState>((set, get) => ({
  enabled: false,
  profile: 'walking',
  contourMinutes: [5, 10, 15],
  origin: null,
  loading: false,
  error: null,

  setEnabled: (enabled) => {
    if (!enabled) {
      get().reset();
    }
    set({ enabled });
  },

  setProfile: (profile) => set({ profile }),

  setContourMinutes: (minutes) => set({ contourMinutes: minutes }),

  setOrigin: (origin) => set({ origin }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  reset: () => set({ origin: null, loading: false, error: null }),
}));
