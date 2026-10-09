import { create } from 'zustand';
import { browserStorage, rememberWelcomeDismissed, shouldShowWelcome } from '../lib/welcomeMemory';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  welcomeOpen: boolean;
  openWelcome: () => void;
  closeWelcome: () => void;
}

// Default the sidebar closed on small screens so it doesn't bury the map on load.
const initialSidebarOpen =
  typeof window === 'undefined' ? true : window.innerWidth >= 600;

// Read once, at load: useShareSync starts rewriting the hash soon after, and
// only the hash the visitor arrived with says whether they followed a link.
const initialWelcomeOpen =
  typeof window === 'undefined' ? false : shouldShowWelcome(window.location.hash, browserStorage());

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: initialSidebarOpen,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  welcomeOpen: initialWelcomeOpen,
  openWelcome: () => set({ welcomeOpen: true }),
  // Every way of closing the card counts as dismissing it in this browser.
  closeWelcome: () => {
    rememberWelcomeDismissed(browserStorage());
    set({ welcomeOpen: false });
  },
}));
