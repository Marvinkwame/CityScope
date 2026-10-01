import { createTheme } from '@mui/material/styles';
import type { ExpressionSpecification } from 'mapbox-gl';

/**
 * "Cartographer's Instrument" design tokens.
 *
 * The only file allowed to contain colour literals — src/colourGuard.test.ts
 * fails `npm test` if one appears anywhere else.
 */
export const AMBER = '#E3B04A'; // honey gold
export const CYAN = '#56C7BE'; // quiet cyan
export const INK = '#0C0D0F'; // neutral graphite base
export const INK_1 = '#141517'; // raised surface (sidebar / navbar)
export const INK_2 = '#1A1C20'; // higher surface / cards

/**
 * Colour roles. Every colour on the map and in the panels plays one of these.
 *   you     — what the user did: pins, drawn areas, the selected district, actions
 *   answer  — the result of an analysis: isochrones, routes, stats, category bars
 *   context — the backdrop an answer sits on: the heatmap, district lines
 * Only one analysis tool can be active at a time, so the map never has to tell
 * two answers apart — it only has to make answers stand out from context.
 */
export const ROLE = {
  you: AMBER,
  answer: CYAN,
  context: '#F3EEE4',
} as const;

/** Neutral surfaces outside the MUI palette. */
export const SURFACE = {
  land: '#101113', // basemap land tint
  water: '#181A1F', // basemap water tint
  panelTop: '#16171A', // top of the sidebar gradient
  hover: '#1C1D22', // hover fill on graphite
  extrusion: '#3E424B', // 3D buildings
} as const;

export const PANEL_GRADIENT = `linear-gradient(180deg, ${SURFACE.panelTop} 0%, ${SURFACE.land} 100%)`;

/**
 * Heatmap stops as [density, colour]: luminance only, one hue that only gains
 * opacity, so more density always looks like more. The rainbow ramp this
 * replaced peaked in brightness at yellow, which made middling densities look
 * like the maximum.
 *
 * The curve is concave on purpose: low densities light up early so the
 * outskirts still read, and the top rises slowly so dense cores keep their
 * texture instead of clipping to a flat plateau.
 */
export const HEAT_RAMP: ReadonlyArray<readonly [number, string]> = [
  [0, 'rgba(243,238,228,0)'],
  [0.2, 'rgba(243,238,228,0.14)'],
  [0.4, 'rgba(243,238,228,0.26)'],
  [0.6, 'rgba(243,238,228,0.38)'],
  [0.8, 'rgba(243,238,228,0.52)'],
  [1, 'rgba(243,238,228,0.7)'],
];

/** HEAT_RAMP as a Mapbox `heatmap-color` expression. */
export function heatmapColorExpression(): ExpressionSpecification {
  return ['interpolate', ['linear'], ['heatmap-density'], ...HEAT_RAMP.flat()];
}

/**
 * HEAT_RAMP as a CSS gradient for the sidebar legend — the same stops as the map,
 * each at its own position, so the legend stays aligned even if the stops are
 * ever not evenly spaced.
 */
export function heatRampGradientCss(): string {
  const stops = HEAT_RAMP.map(([density, colour]) => `${colour} ${density * 100}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

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
