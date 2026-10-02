import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import { alpha } from '@mui/material/styles';
import { useLayerStore } from '../store/layerStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useHeatmapSpotlight } from '../hooks/useHeatmapSpotlight';
import { useUIStore } from '../store/uiStore';
import { SIDEBAR_WIDTH } from './Sidebar';
import { INK_1, ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import PlaceList from './results/PlaceList';
import { formatCount, formatDistance } from './results/format';

function HeatmapSpotlightCard() {
  const heatmapOn = useLayerStore((s) => s.layers.heatmap);
  const clickOrigin = useHeatmapStore((s) => s.clickOrigin);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const spotlight = useHeatmapSpotlight();

  const visible = heatmapOn && spotlight !== null && spotlight.total > 0;

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          bottom: { xs: 40, sm: 32 },
          // On desktop the sidebar overlays the map, so the card rides beside
          // it, sliding with the same timing. On phones the sidebar is a
          // modal drawer, and covering the card while open is intended.
          left: { xs: 12, sm: sidebarOpen ? SIDEBAR_WIDTH + 12 : 12 },
          transition: 'left 0.24s cubic-bezier(0.4,0,0.2,1)',
          width: { xs: 'calc(100vw - 24px)', sm: 280 },
          maxWidth: 300,
          background: alpha(INK_1, 0.92),
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.25,
            py: 0.75,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PlaceIcon aria-hidden sx={{ fontSize: 14, color: ROLE.answer }} />
            <Typography sx={{ color: ROLE.answer, fontWeight: 700, fontSize: 12 }}>
              {formatCount(spotlight?.total ?? 0)} places within 300 m
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => useHeatmapStore.getState().setClickOrigin(null)}
            aria-label="Close spotlight"
            sx={{ color: 'rgba(255,255,255,0.4)', p: 0.25 }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>

        {spotlight && (
          <Box sx={{ px: 1.25, py: 1, maxHeight: '60vh', overflowY: 'auto' }}>
            <CategoryBars counts={spotlight.categoryCounts} total={spotlight.total} />
            <Box sx={{ mt: 1.5 }}>
              <PlaceList
                // A new click is a new list: start collapsed again.
                key={clickOrigin ? `${clickOrigin.lng},${clickOrigin.lat}` : 'none'}
                title="Nearest"
                places={spotlight.allPois.map((p) => ({
                  id: p.id,
                  name: p.name,
                  category: p.category,
                  lng: p.lng,
                  lat: p.lat,
                  meta: formatDistance(p.distanceM),
                }))}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Slide>
  );
}

export default HeatmapSpotlightCard;
