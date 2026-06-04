import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

// Default the sidebar closed on small screens so it doesn't bury the map on load.
const initialSidebarOpen =
  typeof window === 'undefined' ? true : window.innerWidth >= 600;

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: initialSidebarOpen,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
