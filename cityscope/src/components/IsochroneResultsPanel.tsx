import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlaceIcon from '@mui/icons-material/Place';
import { useIsochroneStore } from '../store/isochroneStore';
import { useMapStore } from '../store/mapStore';
import { useIsochrone } from '../hooks/useIsochrone';
import { useIsochroneResults } from '../hooks/useIsochroneResults';
import { usePois } from '../hooks/usePois';
import { ISOCHRONE_COLOR } from '../constants/layerConfig';

const PROFILE_LABEL: Record<string, string> = {
  walking: 'walking',
  cycling: 'cycling',
  driving: 'driving',
};

/** Band colours mirror the map fill-color step expression */
const BAND_COLORS = ['#00E5FF', '#00BCD4', '#0097A7'] as const;
function bandColor(idx: number): string {
  return BAND_COLORS[Math.min(idx, BAND_COLORS.length - 1)];
}

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

function IsochroneResultsPanel() {
  const enabled = useIsochroneStore((s) => s.enabled);
  const origin = useIsochroneStore((s) => s.origin);
  const profile = useIsochroneStore((s) => s.profile);
  const loading = useIsochroneStore((s) => s.loading);

  const { data: isochroneData } = useIsochrone();
  const { data: poisData } = usePois();

  const bands = useIsochroneResults(isochroneData, poisData);

  const hasResults = enabled && origin !== null && !loading && bands.length > 0;

  if (!hasResults) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Divider sx={{ mb: 1.5 }} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <PlaceIcon sx={{ fontSize: 14, color: ISOCHRONE_COLOR }} />
        <Typography
          variant="caption"
          sx={{
            color: ISOCHRONE_COLOR,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Reachability by {PROFILE_LABEL[profile]}
        </Typography>
        <IconButton
          size="small"
          onClick={() => useIsochroneStore.getState().reset()}
          sx={{ ml: 'auto', color: 'text.secondary', p: 0.25 }}
          aria-label="Clear isochrone"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* One accordion per contour band */}
      {bands.map((band, idx) => {
        const color = bandColor(idx);
        const topCategories = Object.entries(band.categoryCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4);

        return (
          <Accordion
            key={band.contour}
            defaultExpanded={false}
            disableGutters
            TransitionProps={{ unmountOnExit: true }}
            sx={{
              background: 'rgba(255,255,255,0.02)',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              borderLeft: `3px solid ${color}`,
              borderRadius: '8px !important',
              boxShadow: 'none',
              pl: 1,
              mb: 1,
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={
                <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              }
              sx={{
                px: 0,
                py: 0.25,
                minHeight: 'unset',
                '& .MuiAccordionSummary-content': { my: 0.25, flexDirection: 'column' },
              }}
            >
              {/* Top row: time label + count */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }}>
                <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Within {band.contour} min
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ ml: 'auto', fontWeight: 700, color: 'text.primary', pr: 0.5 }}
                >
                  {band.pois.length} place{band.pois.length !== 1 ? 's' : ''}
                </Typography>
              </Box>

              {/* Category chips summary */}
              {band.pois.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.4 }}>
                  {topCategories.map(([cat, count]) => (
                    <Chip
                      key={cat}
                      label={`${categoryEmoji(cat)} ${cat} ${count}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        borderColor: 'divider',
                        color: 'text.secondary',
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                  ))}
                  {Object.keys(band.categoryCounts).length > 4 && (
                    <Chip
                      label={`+${Object.keys(band.categoryCounts).length - 4} more`}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        borderColor: 'divider',
                        color: 'text.disabled',
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                  )}
                </Box>
              )}
            </AccordionSummary>

            <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.25 }}>
              {band.pois.length === 0 ? (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', fontStyle: 'italic' }}
                >
                  No POIs in dataset
                </Typography>
              ) : (
                <List dense disablePadding sx={{ maxHeight: 180, overflowY: 'auto' }}>
                  {band.pois.map((poi) => (
                    <ListItemButton
                      key={poi.id}
                      sx={{ px: 0.5, py: 0.25, borderRadius: 0.5, '&:hover': { background: 'rgba(255,255,255,0.05)' } }}
                      onClick={() => {
                        const map = useMapStore.getState().map;
                        if (map) {
                          map.flyTo({
                            center: [poi.lng, poi.lat] as [number, number],
                            zoom: 16,
                            duration: 800,
                          });
                        }
                      }}
                    >
                      <ListItemText
                        primary={
                          <Typography variant="caption" sx={{ display: 'flex', gap: 0.5 }}>
                            <Typography component="span" variant="caption">
                              {categoryEmoji(poi.category)}
                            </Typography>
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ fontWeight: 500 }}
                            >
                              {poi.name ?? 'Unnamed'}
                            </Typography>
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ color: 'text.disabled' }}
                            >
                              · {poi.category}
                            </Typography>
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}

export default IsochroneResultsPanel;
