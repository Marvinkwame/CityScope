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
import { LAYER_CONFIGS } from '../constants/layerConfig';

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
      <Box sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">
          Layers
        </Typography>
        <List dense>
          {LAYER_CONFIGS.map(({ id, label, color }) => (
            <ListItem key={id} disablePadding sx={{ py: 0.5 }}>
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
          ))}
        </List>
      </Box>
    </Drawer>
  );
}

export { SIDEBAR_WIDTH };
export default Sidebar;
