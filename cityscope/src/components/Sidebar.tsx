import { Fragment } from 'react';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import CircleIcon from '@mui/icons-material/Circle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useLayerStore } from '../store/layerStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useCityStore } from '../store/cityStore';
import { LAYER_CONFIGS } from '../constants/layerConfig';
import IsochroneControls from './IsochroneControls';
import RouteControls from './RouteControls';
import { AMBER, CYAN, MONO, DISPLAY } from '../theme';
import { useUIStore } from '../store/uiStore';
import { NAV_HEIGHT } from './Navbar';

const SIDEBAR_WIDTH = 296;

/** Numbered section header with a hairline rule — strong hierarchy. */
function SectionHeader({ index, label }: { index: string; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: '0.6rem',
          fontWeight: 600,
          color: AMBER,
        }}
      >
        {index}
      </Typography>
      <Typography
        sx={{
          fontFamily: DISPLAY,
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '2.5px',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.82)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
    </Box>
  );
}

/** A stacked module that animates in on load. */
function Module({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        opacity: 0,
        animation: 'inst-rise 0.5s ease-out forwards',
        animationDelay: `${delay}ms`,
      }}
    >
      {children}
    </Box>
  );
}

function Sidebar() {
  const layers = useLayerStore((state) => state.layers);
  const toggleLayer = useLayerStore((state) => state.toggleLayer);
  const isochroneEnabled = useIsochroneStore((s) => s.enabled);
  const routeEnabled = useRouteStore((s) => s.enabled);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const selectedCity = useCityStore((s) => s.selectedCity);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const sidebarWidth = isMobile ? 'min(296px, 86vw)' : `${SIDEBAR_WIDTH}px`;

  return (
    <>
    {/* Mobile scrim — dims the map and dismisses the sidebar on tap */}
    {isMobile && sidebarOpen && (
      <Box
        onClick={() => setSidebarOpen(false)}
        sx={{
          position: 'fixed',
          top: `${NAV_HEIGHT}px`,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(1px)',
          zIndex: (t) => t.zIndex.drawer - 1,
          animation: 'inst-rise 0.2s ease-out',
        }}
      />
    )}
    <Box
      sx={{
        position: 'fixed',
        top: `${NAV_HEIGHT}px`,
        left: sidebarOpen ? 0 : `calc(0px - ${sidebarWidth})`,
        width: sidebarWidth,
        height: `calc(100vh - ${NAV_HEIGHT}px)`,
        zIndex: (theme) => theme.zIndex.drawer,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #16171A 0%, #101113 100%)',
        transition: 'left 0.24s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: sidebarOpen ? '1px 0 0 rgba(255,255,255,0.04), 8px 0 32px rgba(0,0,0,0.45)' : 'none',
      }}
    >
      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', p: 2 }}>
        <Module delay={60}>
          <SectionHeader index="01" label="Layers" />

          <List dense disablePadding sx={{ mb: 1 }}>
            {LAYER_CONFIGS.map(({ id, label, color }) => {
              const on = layers[id];
              return (
                <Fragment key={id}>
                  <ListItem
                    disablePadding
                    sx={{
                      mb: 0.5,
                      px: 1,
                      py: 0.5,
                      borderRadius: '5px',
                      background: on ? 'rgba(255,255,255,0.025)' : 'transparent',
                      transition: 'all 0.15s ease',
                      '&:hover': { background: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 26 }}>
                      <CircleIcon
                        sx={{
                          color: on ? color : 'rgba(255,255,255,0.25)',
                          fontSize: 8,
                          transition: 'all 0.2s ease',
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          sx={{
                            fontFamily: 'inherit',
                            fontSize: '0.84rem',
                            fontWeight: on ? 500 : 400,
                            color: on ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.50)',
                            transition: 'color 0.15s ease',
                          }}
                        >
                          {label}
                        </Typography>
                      }
                    />
                    <Switch
                      edge="end"
                      size="small"
                      checked={on}
                      onChange={() => toggleLayer(id)}
                    />
                  </ListItem>

                  {id === 'heatmap' && (
                    <Collapse in={layers.heatmap}>
                      <Box
                        sx={{
                          ml: 2,
                          mt: 0.5,
                          mb: 0.5,
                          px: 1.25,
                          py: 1,
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <Typography
                          sx={{
                            fontFamily: MONO,
                            fontSize: '0.55rem',
                            fontWeight: 500,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.40)',
                          }}
                        >
                          POI Density
                        </Typography>
                        <Box
                          sx={{
                            mt: 0.75,
                            mb: 0.5,
                            height: 6,
                            borderRadius: 1,
                            background:
                              'linear-gradient(to right, rgb(65,105,225), rgb(0,180,120), rgb(255,255,0), rgb(255,165,0), rgb(255,0,0))',
                          }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          {['Low', 'Medium', 'High'].map((t) => (
                            <Typography
                              key={t}
                              sx={{
                                fontFamily: MONO,
                                fontSize: '0.55rem',
                                color: 'rgba(255,255,255,0.40)',
                              }}
                            >
                              {t}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    </Collapse>
                  )}
                </Fragment>
              );
            })}
          </List>
        </Module>

        {/* Analysis section */}
        <Module delay={140}>
          <Box sx={{ pt: 1.5 }}>
            <SectionHeader index="02" label="Analysis" />
          </Box>

          {/* Isochrone module */}
          <ModuleCard active={isochroneEnabled}>
            <IsochroneControls />
          </ModuleCard>

          {/* Route module */}
          <ModuleCard active={routeEnabled}>
            <RouteControls />
          </ModuleCard>
        </Module>
      </Box>

      {/* Pinned status footer */}
      <Box
        sx={{
          flexShrink: 0,
          px: 2,
          py: 1.25,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: CYAN,
            animation: 'inst-blink 2.4s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontFamily: DISPLAY,
              fontSize: '0.66rem',
              fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.75)',
            }}
            noWrap
          >
            {selectedCity.name}
          </Typography>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '0.55rem',
              letterSpacing: '0.5px',
              color: 'rgba(255,255,255,0.35)',
            }}
            noWrap
          >
            {selectedCity.centerLat.toFixed(4)}°N {selectedCity.centerLng.toFixed(4)}°E
          </Typography>
        </Box>
        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: '0.5rem',
            letterSpacing: '1px',
            color: 'rgba(255,255,255,0.30)',
            flexShrink: 0,
          }}
        >
          OSM · MAPBOX
        </Typography>
      </Box>
    </Box>

    {/* Edge-attached toggle handle — rides the panel, pins to the screen edge when collapsed */}
    <Box
      role="button"
      tabIndex={0}
      aria-label={sidebarOpen ? 'Collapse panel' : 'Expand panel'}
      onClick={toggleSidebar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSidebar();
        }
      }}
      sx={{
        position: 'fixed',
        top: `calc(${NAV_HEIGHT}px + (100vh - ${NAV_HEIGHT}px) / 2)`,
        left: sidebarOpen ? sidebarWidth : 0,
        transform: 'translateY(-50%)',
        zIndex: (theme) => theme.zIndex.drawer,
        width: 21,
        height: 54,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.50)',
        background: 'linear-gradient(180deg, #16171A 0%, #101113 100%)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '0 8px 8px 0',
        boxShadow: '4px 0 16px rgba(0,0,0,0.35)',
        transition:
          'left 0.24s cubic-bezier(0.4,0,0.2,1), color 0.15s ease, background 0.15s ease',
        '&:hover': { color: AMBER, background: '#1C1D22' },
      }}
    >
      {sidebarOpen ? (
        <ChevronLeftIcon sx={{ fontSize: 18 }} />
      ) : (
        <ChevronRightIcon sx={{ fontSize: 18 }} />
      )}
    </Box>
    </>
  );
}

/** Analysis tool wrapper — titled card with a status LED. */
function ModuleCard({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        position: 'relative',
        mb: 1.25,
        borderRadius: '8px',
        border: `1px solid ${active ? 'rgba(227,176,74,0.32)' : 'rgba(255,255,255,0.06)'}`,
        background: active ? 'rgba(227,176,74,0.04)' : 'rgba(255,255,255,0.015)',
        transition: 'all 0.2s ease',
        // status LED, top-right corner
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 11,
          right: 11,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? AMBER : 'rgba(255,255,255,0.16)',
          transition: 'all 0.2s ease',
        },
      }}
    >
      {children}
    </Box>
  );
}

export { SIDEBAR_WIDTH };
export default Sidebar;
