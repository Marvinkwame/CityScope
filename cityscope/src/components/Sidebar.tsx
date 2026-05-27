import { Fragment } from 'react';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import CircleIcon from '@mui/icons-material/Circle';
import { useLayerStore } from '../store/layerStore';
import { LAYER_CONFIGS } from '../constants/layerConfig';
import IsochroneControls from './IsochroneControls';
import RouteControls from './RouteControls';

const SIDEBAR_WIDTH = 280;

function Sidebar() {
  const layers = useLayerStore((state) => state.layers);
  const toggleLayer = useLayerStore((state) => state.toggleLayer);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
        },
      }}
    >
      <Toolbar />
      <Box sx={{ p: 2, overflowY: 'auto', height: 'calc(100vh - 64px)' }}>
        <Typography variant="overline" color="text.secondary">
          Layers
        </Typography>
        <List dense>
          {LAYER_CONFIGS.map(({ id, label, color }) => (
            <Fragment key={id}>
              <ListItem disablePadding sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CircleIcon sx={{ color, fontSize: 14 }} />
                </ListItemIcon>
                <ListItemText primary={label} />
                <Switch
                  edge="end"
                  size="small"
                  checked={layers[id]}
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
                      background: '#1e1e1e',
                      borderRadius: 1.5,
                      border: '1px solid #2a2a2a',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}
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
                      <Typography variant="caption" sx={{ color: '#555' }}>
                        Low
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#555' }}>
                        Medium
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#555' }}>
                        High
                      </Typography>
                    </Box>
                  </Box>
                </Collapse>
              )}
            </Fragment>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="overline" color="text.secondary">
          Analysis Tools
        </Typography>
        <Box sx={{ mt: 1 }}>
          <IsochroneControls />
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ mt: 1 }}>
          <RouteControls />
        </Box>
      </Box>
    </Drawer>
  );
}

export { SIDEBAR_WIDTH };
export default Sidebar;
