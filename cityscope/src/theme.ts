import { createTheme } from '@mui/material/styles';

/**
 * "Cartographer's Instrument" design tokens.
 *
 * Signal system — colours carry meaning:
 *   GOLD  → UI chrome, tools, active controls
 *   CYAN  → live data / measurement only (isochrone bands, route stats, LIVE)
 */
export const AMBER = '#E3B04A'; // honey gold — the single brand accent
export const CYAN = '#56C7BE'; // quiet functional 'live data' signal only
export const INK = '#0C0D0F'; // neutral graphite base
export const INK_1 = '#141517'; // raised surface (sidebar / navbar)
export const INK_2 = '#1A1C20'; // higher surface / cards

export const MONO = "'Martian Mono', ui-monospace, monospace";
export const DISPLAY = "'Saira', system-ui, sans-serif";
export const BODY = "'Archivo', system-ui, sans-serif";

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: AMBER,
    },
    secondary: {
      main: CYAN,
    },
    background: {
      default: INK,
      paper: INK_1,
    },
    text: {
      primary: 'rgba(255,255,255,0.92)',
      secondary: 'rgba(255,255,255,0.58)',
      disabled: 'rgba(255,255,255,0.40)',
    },
    divider: 'rgba(255,255,255,0.06)',
  },
  typography: {
    fontFamily: BODY,
    h5: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      letterSpacing: '0.5px',
    },
    h6: {
      fontFamily: DISPLAY,
      fontWeight: 700,
    },
    button: {
      fontFamily: DISPLAY,
    },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Orchestrated load + recurring micro-motion, available app-wide.
        '@keyframes inst-rise': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes inst-draw': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        '@keyframes inst-blink': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.25 },
        },
        '@keyframes inst-pulse': {
          '0%': { boxShadow: '0 0 0 0 currentColor' },
          '70%': { boxShadow: '0 0 0 5px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
        // Refined scrollbars — instrument, not chrome.
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(255,255,255,0.10)',
          borderRadius: 4,
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(255,255,255,0.18)',
        },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: AMBER,
            '& + .MuiSwitch-track': {
              backgroundColor: AMBER,
              opacity: 0.35,
            },
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.50)',
          '&.Mui-selected': {
            color: AMBER,
            backgroundColor: 'rgba(227,176,74,0.14)',
            '&:hover': {
              backgroundColor: 'rgba(227,176,74,0.22)',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default theme;
