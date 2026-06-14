import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useDrawStore } from '../store/drawStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useCityStore } from '../store/cityStore';
import { useAreaAnalysis } from '../hooks/useAreaAnalysis';
import { AMBER, MONO } from '../theme';

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Box>
      <Typography sx={{ fontFamily: MONO, fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}>
        {value}
        {unit ? <Box component="span" sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', ml: 0.5 }}>{unit}</Box> : null}
      </Typography>
      <Typography sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mt: 0.25 }}>
        {label}
      </Typography>
    </Box>
  );
}

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
              <CircularProgress size={18} sx={{ color: AMBER }} />
            </Box>
          )}

          {polygon && isError && (
            <Typography variant="caption" sx={{ color: 'error.main' }}>
              Couldn't analyse this area.
            </Typography>
          )}

          {polygon && data && (
            <Box>
              <Box sx={{ display: 'flex', gap: 3, mb: 1.5 }}>
                <Stat label="POIs" value={String(data.poiCount)} />
                <Stat label="Area" value={data.areaKm2.toFixed(1)} unit="km²" />
                <Stat label="Density" value={data.densityPerKm2.toFixed(0)} unit="/km²" />
              </Box>
              {data.poiCount > 0 ? (
                <>
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mb: 1 }}>
                    Top categories
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {data.topCategories.map((c) => (
                      <Chip key={c.category} label={`${c.category} · ${c.count}`} size="small"
                        sx={{ fontFamily: MONO, fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} />
                    ))}
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">No POIs in this area.</Typography>
              )}
            </Box>
          )}

          {polygon && (
            <Button
              size="small"
              onClick={requestClear}
              sx={{
                alignSelf: 'flex-start',
                color: 'text.secondary',
                textTransform: 'none',
                fontSize: '0.75rem',
                px: 0.5,
                minWidth: 0,
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
