import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import { useFeatureStore } from '../store/featureStore';
import { LAYER_CONFIGS } from '../constants/layerConfig';
import { MONO } from '../theme';
import { NAV_HEIGHT } from './Navbar';
import { useCityStore } from '../store/cityStore';
import DistrictStatsView from './DistrictStatsView';

const PANEL_WIDTH = 360;

const EXCLUDED_KEYS = new Set([
  'mapbox_clip_start',
  'mapbox_clip_end',
  'layer',
  'source',
  'sourceLayer',
]);

function filterProperties(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      !EXCLUDED_KEYS.has(key) &&
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      result[key] = value;
    }
  }
  return result;
}

function FeaturePanel() {
  const selectedFeature = useFeatureStore((state) => state.selectedFeature);
  const clearFeature = useFeatureStore((state) => state.clearFeature);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const cityId = useCityStore((s) => s.selectedCity.id);

  const isOpen = selectedFeature !== null;
  const config = selectedFeature
    ? LAYER_CONFIGS.find((c) => c.id === selectedFeature.type)
    : null;
  const filteredProps = selectedFeature
    ? filterProperties(selectedFeature.properties)
    : {};

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'persistent'}
      anchor={isMobile ? 'bottom' : 'right'}
      open={isOpen}
      onClose={clearFeature}
      sx={{
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          backgroundImage: 'none',
          ...(isMobile
            ? {
                width: '100%',
                maxHeight: '78vh',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
              }
            : {
                width: PANEL_WIDTH,
                borderLeft: 'none',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.45)',
              }),
        },
      }}
    >
      {isMobile ? (
        <Box sx={{ pt: 1.25, pb: 0.5, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.20)' }} />
        </Box>
      ) : (
        <Box sx={{ height: `${NAV_HEIGHT}px`, flexShrink: 0 }} />
      )}
      {selectedFeature && (
        <Box sx={{ p: 2 }}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <Chip
              label={config?.label ?? selectedFeature.type}
              size="small"
              sx={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${config?.color ?? 'rgba(255,255,255,0.6)'}`,
                color: config?.color ?? 'rgba(255,255,255,0.6)',
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            />
            <IconButton onClick={clearFeature} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="h5" sx={{ fontWeight: 600, mt: 1 }}>
            {selectedFeature.name ?? 'Unnamed Feature'}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              mt: 0.5,
              color: 'rgba(255,255,255,0.45)',
              fontFamily: MONO,
              fontSize: '0.78rem',
            }}
          >
            {selectedFeature.coordinates.lat.toFixed(5)},{' '}
            {selectedFeature.coordinates.lng.toFixed(5)}
          </Typography>

          <Divider sx={{ my: 1.5 }} />

          {selectedFeature.type === 'districts' && selectedFeature.featureId != null ? (
            <DistrictStatsView cityId={cityId} districtId={selectedFeature.featureId} />
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
                  Properties
                </Typography>
                <Box sx={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              </Box>

              {Object.keys(filteredProps).length > 0 ? (
                <Table size="small">
                  <TableBody>
                    {Object.entries(filteredProps).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            pl: 0,
                          }}
                        >
                          {key}
                        </TableCell>
                        <TableCell
                          sx={{
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            pr: 0,
                            fontFamily: MONO,
                            fontSize: '0.78rem',
                          }}
                        >
                          {String(value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No properties available
                </Typography>
              )}
            </>
          )}
        </Box>
      )}
    </Drawer>
  );
}

export default FeaturePanel;
