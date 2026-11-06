import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import { useLayerStore } from '../store/layerStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useHeatmapSpotlight } from '../hooks/useHeatmapSpotlight';
import { ROLE } from '../theme';
import MapCardSlot from './MapCardSlot';
import CategoryBars from './results/CategoryBars';
import PlaceList from './results/PlaceList';
import { formatCount, formatDistance } from './results/format';

function HeatmapSpotlightCard() {
  const heatmapOn = useLayerStore((s) => s.layers.heatmap);
  const clickOrigin = useHeatmapStore((s) => s.clickOrigin);
  const spotlight = useHeatmapSpotlight();

  const total = spotlight?.total ?? 0;
  const visible = heatmapOn && total > 0;

  return (
    <MapCardSlot visible={visible}>
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
            {formatCount(total)} {total === 1 ? 'place' : 'places'} within 300 m
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
    </MapCardSlot>
  );
}

export default HeatmapSpotlightCard;
