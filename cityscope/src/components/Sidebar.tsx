import { Fragment } from 'react';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import CircleIcon from '@mui/icons-material/Circle';
import { useLayerStore } from '../store/layerStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { LAYER_CONFIGS } from '../constants/layerConfig';
import IsochroneControls from './IsochroneControls';
import RouteControls from './RouteControls';

const SIDEBAR_WIDTH = 280;

function SectionHeader({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      <Typography
        sx={{
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
    </Box>
  );
}

function Sidebar() {
  const layers = useLayerStore((state) => state.layers);
  const toggleLayer = useLayerStore((state) => state.toggleLayer);
  const isochroneEnabled = useIsochroneStore((s) => s.enabled);
  const routeEnabled = useRouteStore((s) => s.enabled);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          background: '#050508',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        },
      }}
    >
      <Toolbar />
      <Box sx={{ p: 2, overflowY: 'auto', height: 'calc(100vh - 64px)' }}>

        <SectionHeader label="Layers" />

        <List dense sx={{ mb: 0 }}>
          {LAYER_CONFIGS.map(({ id, label, color }) => (
            <Fragment key={id}>
              <ListItem
                disablePadding
                sx={{
                  mb: 0.5,
                  px: 1,
                  py: 0.25,
                  background: layers[id]
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${layers[id]
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: '8px',
                  transition: 'all 0.15s ease',
                }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CircleIcon
                    sx={{
                      color,
                      fontSize: 10,
                      filter: layers[id]
                        ? `drop-shadow(0 0 4px ${color})`
                        : 'none',
                      transition: 'filter 0.2s ease',
                    }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      sx={{
                        fontSize: '0.8rem',
                        color: layers[id]
                          ? 'rgba(255,255,255,0.85)'
                          : 'rgba(255,255,255,0.5)',
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
                  checked={layers[id]}
                  onChange={() => toggleLayer(id)}
                  sx={{
                    '& .MuiSwitch-thumb': {
                      color: layers[id] ? '#00E5FF' : undefined,
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: layers[id]
                        ? 'rgba(0,229,255,0.3) !important'
                        : undefined,
                    },
                  }}
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
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 1.5,
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.25)',
                      }}
                    >
                      POI Density
                    </Typography>
                    <Box
                      sx={{
                        mt: 0.5,
                        mb: 0.5,
                        height: 7,
                        borderRadius: 1,
                        background:
                          'linear-gradient(to right, rgb(65,105,225), rgb(0,180,120), rgb(255,255,0), rgb(255,165,0), rgb(255,0,0))',
                      }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)' }}>
                        Low
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)' }}>
                        Medium
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)' }}>
                        High
                      </Typography>
                    </Box>
                  </Box>
                </Collapse>
              )}
            </Fragment>
          ))}
        </List>

        {/* Analysis section */}
        <Box sx={{ pt: 2 }}>
          <SectionHeader label="Analysis" />
        </Box>

        {/* Isochrone tool card */}
        <Box
          sx={{
            background: isochroneEnabled
              ? 'rgba(0,229,255,0.04)'
              : 'rgba(255,255,255,0.02)',
            border: `1px solid ${isochroneEnabled
              ? 'rgba(0,229,255,0.22)'
              : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '12px',
            boxShadow: isochroneEnabled
              ? '0 0 20px rgba(0,229,255,0.08)'
              : 'none',
            transition: 'all 0.2s ease',
            mb: 1,
          }}
        >
          <IsochroneControls />
        </Box>

        {/* Route tool card */}
        <Box
          sx={{
            background: routeEnabled
              ? 'rgba(0,229,255,0.04)'
              : 'rgba(255,255,255,0.02)',
            border: `1px solid ${routeEnabled
              ? 'rgba(0,229,255,0.22)'
              : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '12px',
            boxShadow: routeEnabled
              ? '0 0 20px rgba(0,229,255,0.08)'
              : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <RouteControls />
        </Box>

      </Box>
    </Drawer>
  );
}

export { SIDEBAR_WIDTH };
export default Sidebar;
