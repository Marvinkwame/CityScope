import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useDrawStore } from '../store/drawStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useCityStore } from '../store/cityStore';
import { useAreaAnalysis } from '../hooks/useAreaAnalysis';
import { ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import StatRow from './results/StatRow';
import { formatCount } from './results/format';
import { clearReach } from '../lib/viewExclusivity';

function DrawControls() {
  const enabled = useDrawStore((s) => s.enabled);
  const polygon = useDrawStore((s) => s.polygon);
  const setEnabled = useDrawStore((s) => s.setEnabled);
  const requestClear = useDrawStore((s) => s.requestClear);
  const cityId = useCityStore((s) => s.selectedCity.id);
  const { data, isLoading, isError } = useAreaAnalysis(cityId, polygon);

  const handleToggle = (checked: boolean) => {
    if (checked) {
      useIsochroneStore.getState().setEnabled(false);
      useRouteStore.getState().setEnabled(false);
      clearReach();
    }
    setEnabled(checked);
  };

  return (
    <Box sx={{ p: 1.25 }}>
      <FormControlLabel
        control={<Switch checked={enabled} onChange={(e) => handleToggle(e.target.checked)} size="small" />}
        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Draw Area</Typography>}
        sx={{ ml: 0, mb: enabled ? 1.5 : 0 }}
      />

      {enabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {!polygon && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              Click points on the map, double-click to finish.
            </Typography>
          )}

          {polygon && isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={18} sx={{ color: ROLE.answer }} />
            </Box>
          )}

          {polygon && isError && (
            <Typography variant="caption" sx={{ color: 'error.main' }}>
              Couldn't analyse this area.
            </Typography>
          )}

          {polygon && data && (
            <Box>
              <StatRow
                stats={[
                  { label: 'POIs', value: formatCount(data.poiCount) },
                  { label: 'Area', value: data.areaKm2.toFixed(1), unit: 'km²' },
                  { label: 'Density', value: formatCount(data.densityPerKm2), unit: '/km²' },
                ]}
              />
              {data.poiCount > 0 ? (
                <CategoryBars counts={data.topCategories} total={data.poiCount} />
              ) : (
                <Typography variant="body2" color="text.secondary">No POIs in this area.</Typography>
              )}
            </Box>
          )}

          {polygon && (
            // Clearing the shape is something the user does, so it takes the "you" colour.
            <Button
              size="small"
              onClick={requestClear}
              sx={{
                alignSelf: 'flex-start',
                color: ROLE.you,
                textTransform: 'none',
                fontSize: '0.75rem',
                px: 0.75,
                minWidth: 0,
                '&:hover': { background: alpha(ROLE.you, 0.08) },
              }}
            >
              Clear area
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export default DrawControls;
