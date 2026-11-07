import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Slide from '@mui/material/Slide';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha } from '@mui/material/styles';
import { useUIStore } from '../store/uiStore';
import { SIDEBAR_HANDLE_WIDTH, SIDEBAR_WIDTH } from './Sidebar';
import { INK_1 } from '../theme';

/**
 * The bottom-left card over the map, shared by the heatmap spotlight and the
 * everyday reach card. It slides up when `visible` turns on, and appears at
 * once under the reduced-motion setting.
 */
function MapCardSlot({ visible, children }: { visible: boolean; children: ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    // Positioning lives on this wrapper, not on Slide's child: Slide writes an
    // inline `transition` on its child, which would override a `left`
    // transition. On desktop the sidebar overlays the map, so the card rides
    // beside it, sliding with the same timing. On every screen size it sits
    // clear of the sidebar's edge handle, open or collapsed. On phones the
    // sidebar is a modal drawer that covers the card while open, as intended,
    // so the card only needs to clear the collapsed handle there.
    <Box
      sx={{
        position: 'absolute',
        bottom: { xs: 40, sm: 32 },
        left: {
          xs: SIDEBAR_HANDLE_WIDTH + 12,
          sm: (sidebarOpen ? SIDEBAR_WIDTH : 0) + SIDEBAR_HANDLE_WIDTH + 12,
        },
        transition: 'left 0.24s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 10,
        // The wrapper outlives the card; never let it swallow map clicks.
        pointerEvents: 'none',
      }}
    >
      <Slide direction="up" in={visible} mountOnEnter unmountOnExit timeout={reduceMotion ? 0 : undefined}>
        <Box
          sx={{
            pointerEvents: 'auto',
            // 12 px of gutter on each side of the card, plus the handle.
            width: { xs: `calc(100vw - ${SIDEBAR_HANDLE_WIDTH + 24}px)`, sm: 280 },
            maxWidth: 300,
            background: alpha(INK_1, 0.92),
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}
        >
          {children}
        </Box>
      </Slide>
    </Box>
  );
}

export default MapCardSlot;
