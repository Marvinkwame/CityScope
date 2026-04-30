import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useLayerStore } from '../store/layerStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useMapStore } from '../store/mapStore';
import { useHeatmapSpotlight } from '../hooks/useHeatmapSpotlight';

function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    restaurant: '🍽️',
    cafe: '☕',
    bar: '🍺',
    park: '🌳',
    museum: '🏛️',
    hospital: '🏥',
    school: '🏫',
    supermarket: '🛒',
    pharmacy: '💊',
    hotel: '🏨',
    gym: '🏋️',
    library: '📚',
    bank: '🏦',
    cinema: '🎬',
    theatre: '🎭',
    church: '⛪',
  };
  return map[cat.toLowerCase()] ?? '📍';
}

const ACCENT = '#FF7043';

function HeatmapSpotlightCard() {
  const [expanded, setExpanded] = useState(false);

  const heatmapOn = useLayerStore((s) => s.layers.heatmap);
  const spotlight = useHeatmapSpotlight();

  const visible = heatmapOn && spotlight !== null && spotlight.total > 0;

  function handleClose() {
    useHeatmapStore.getState().setClickOrigin(null);
    setExpanded(false);
  }

  function flyTo(lng: number, lat: number) {
    const map = useMapStore.getState().map;
    if (map) map.flyTo({ center: [lng, lat] as [number, number], zoom: 16, duration: 800 });
  }

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          bottom: 32,
          left: 12,
          width: 280,
          background: 'rgba(22,22,22,0.96)',
          border: '1px solid #2a2a2a',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.25,
            py: 0.75,
            borderBottom: '1px solid #2a2a2a',
          }}
        >
          <Typography sx={{ color: ACCENT, fontWeight: 700, fontSize: 12 }}>
            📍 {spotlight?.total ?? 0} places within 300m
          </Typography>
          <IconButton
            size="small"
            onClick={handleClose}
            aria-label="Close spotlight"
            sx={{ color: '#555', p: 0.25 }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>

        {spotlight && (
          <>
            {/* Category chips */}
            <Box
              sx={{
                px: 1.25,
                py: 0.75,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                borderBottom: '1px solid #2a2a2a',
              }}
            >
              {Object.entries(spotlight.categoryCounts).map(([cat, count]) => (
                <Chip
                  key={cat}
                  label={`${categoryEmoji(cat)} ${cat} × ${count}`}
                  size="small"
                  sx={{
                    fontSize: 10,
                    height: 20,
                    background: '#2a2a2a',
                    color: '#ccc',
                    border: '1px solid #333',
                  }}
                />
              ))}
            </Box>

            {/* Top 5 closest */}
            <Box sx={{ px: 1.25 }}>
              {spotlight.topPois.map((poi, i) => (
                <Box
                  key={poi.id}
                  onClick={() => flyTo(poi.lng, poi.lat)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.5,
                    cursor: 'pointer',
                    borderBottom:
                      i < spotlight.topPois.length - 1 ? '1px solid #222' : 'none',
                    '&:hover': { background: 'rgba(255,255,255,0.04)', borderRadius: 0.5 },
                  }}
                >
                  <Typography sx={{ fontSize: 11 }}>{categoryEmoji(poi.category)}</Typography>
                  <Typography sx={{ flex: 1, color: '#ddd', fontSize: 11 }} noWrap>
                    {poi.name ?? 'Unnamed'}
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: 10, flexShrink: 0 }}>
                    {poi.distanceM}m
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* See all expander toggle */}
            <Box
              onClick={() => setExpanded((v) => !v)}
              sx={{
                px: 1.25,
                py: 0.75,
                borderTop: '1px solid #2a2a2a',
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { background: 'rgba(255,112,67,0.06)' },
              }}
            >
              <Typography sx={{ color: ACCENT, fontSize: 11 }}>
                {expanded ? '↑ Hide list' : `↓ See all ${spotlight.total} places`}
              </Typography>
            </Box>

            {/* Full scrollable list */}
            <Collapse in={expanded}>
              <Box sx={{ maxHeight: 200, overflowY: 'auto', px: 1.25 }}>
                {spotlight.allPois.map((poi, i) => (
                  <Box
                    key={poi.id}
                    onClick={() => flyTo(poi.lng, poi.lat)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      py: 0.5,
                      cursor: 'pointer',
                      borderBottom:
                        i < spotlight.allPois.length - 1 ? '1px solid #222' : 'none',
                      '&:hover': { background: 'rgba(255,255,255,0.04)', borderRadius: 0.5 },
                    }}
                  >
                    <Typography sx={{ fontSize: 11 }}>{categoryEmoji(poi.category)}</Typography>
                    <Typography sx={{ flex: 1, color: '#ddd', fontSize: 11 }} noWrap>
                      {poi.name ?? 'Unnamed'}
                    </Typography>
                    <Typography sx={{ color: '#555', fontSize: 10, flexShrink: 0 }}>
                      {poi.distanceM}m
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </>
        )}
      </Box>
    </Slide>
  );
}

export default HeatmapSpotlightCard;
