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
import { alpha } from '@mui/material/styles';
import { INK_1, MONO, ROLE } from '../theme';

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
          bottom: { xs: 40, sm: 32 },
          left: 12,
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
        {/* Header */}
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
          <Typography sx={{ color: ROLE.answer, fontWeight: 700, fontSize: 12 }}>
            📍 {spotlight?.total ?? 0} places within 300m
          </Typography>
          <IconButton
            size="small"
            onClick={handleClose}
            aria-label="Close spotlight"
            sx={{ color: 'rgba(255,255,255,0.4)', p: 0.25 }}
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
                borderBottom: '1px solid rgba(255,255,255,0.07)',
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
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.7)',
                    border: '1px solid rgba(255,255,255,0.1)',
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
                      i < spotlight.topPois.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    '&:hover': { background: 'rgba(255,255,255,0.04)', borderRadius: 0.5 },
                  }}
                >
                  <Typography sx={{ fontSize: 11 }}>{categoryEmoji(poi.category)}</Typography>
                  <Typography sx={{ flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 11 }} noWrap>
                    {poi.name ?? 'Unnamed'}
                  </Typography>
                  <Typography sx={{ fontFamily: MONO, color: 'rgba(255,255,255,0.4)', fontSize: 10, flexShrink: 0 }}>
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
                borderTop: '1px solid rgba(255,255,255,0.07)',
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { background: alpha(ROLE.you, 0.06) },
              }}
            >
              <Typography sx={{ color: ROLE.you, fontSize: 11 }}>
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
                        i < spotlight.allPois.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      '&:hover': { background: 'rgba(255,255,255,0.04)', borderRadius: 0.5 },
                    }}
                  >
                    <Typography sx={{ fontSize: 11 }}>{categoryEmoji(poi.category)}</Typography>
                    <Typography sx={{ flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 11 }} noWrap>
                      {poi.name ?? 'Unnamed'}
                    </Typography>
                    <Typography sx={{ fontFamily: MONO, color: 'rgba(255,255,255,0.4)', fontSize: 10, flexShrink: 0 }}>
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
