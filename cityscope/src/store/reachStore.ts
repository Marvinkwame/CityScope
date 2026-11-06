import { create } from 'zustand';
import { NEED_IDS, canonicalNeeds } from '../lib/reach/model';
import type { NeedId, ReachMinutes } from '../lib/reach/model';

interface ReachState {
  enabled: boolean;
  minutes: ReachMinutes;
  needs: NeedId[];
  selectedCell: string | null;
  setEnabled: (enabled: boolean) => void;
  setMinutes: (minutes: ReachMinutes) => void;
  toggleNeed: (id: NeedId) => void;
  setNeeds: (ids: readonly NeedId[]) => void;
  selectCell: (cell: string | null) => void;
}

export const useReachStore = create<ReachState>((set) => ({
  enabled: false,
  minutes: 15,
  needs: [...NEED_IDS],
  selectedCell: null,

  // Switching off also drops the selected block, so nothing stale reappears.
  setEnabled: (enabled) =>
    set(enabled ? { enabled } : { enabled, selectedCell: null }),

  setMinutes: (minutes) => set({ minutes }),

  toggleNeed: (id) =>
    set((state) => {
      const next = state.needs.includes(id)
        ? state.needs.filter((n) => n !== id)
        : canonicalNeeds([...state.needs, id]);
      return next.length === 0 ? state : { needs: next };
    }),

  setNeeds: (ids) =>
    set((state) => {
      const next = canonicalNeeds(ids);
      return next.length === 0 ? state : { needs: next };
    }),

  selectCell: (cell) => set({ selectedCell: cell }),
}));
