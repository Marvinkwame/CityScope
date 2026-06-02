import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { useIsochroneStore } from '../store/isochroneStore';
import type { TravelProfile } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import IsochroneResultsPanel from './IsochroneResultsPanel';

const TIME_PRESETS = [5, 10, 15, 20, 30] as const;

function buildContours(maxMinutes: number): number[] {
  if (maxMinutes <= 5) return [5];
  if (maxMinutes <= 10) return [5, 10];
  return [Math.round(maxMinutes / 3), Math.round((2 * maxMinutes) / 3), maxMinutes];
}

function IsochroneControls() {
  const enabled = useIsochroneStore((s) => s.enabled);
  const profile = useIsochroneStore((s) => s.profile);
  const contourMinutes = useIsochroneStore((s) => s.contourMinutes);
  const origin = useIsochroneStore((s) => s.origin);
  const loading = useIsochroneStore((s) => s.loading);
  const error = useIsochroneStore((s) => s.error);
  const setEnabled = useIsochroneStore((s) => s.setEnabled);
  const setProfile = useIsochroneStore((s) => s.setProfile);
  const setContourMinutes = useIsochroneStore((s) => s.setContourMinutes);

  const maxMinutes = contourMinutes[contourMinutes.length - 1] ?? 15;

  const handleProfileChange = (
    _: React.MouseEvent<HTMLElement>,
    newProfile: TravelProfile | null,
  ) => {
    if (newProfile) setProfile(newProfile);
  };

  const handlePresetClick = (preset: number) => {
    setContourMinutes(buildContours(preset));
  };

  const handleToggle = (checked: boolean) => {
    if (checked) {
      useRouteStore.getState().setEnabled(false);
    }
    setEnabled(checked);
  };

  return (
    <Box sx={{ p: 1.25 }}>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            size="small"
            sx={{ '& .MuiSwitch-thumb': { color: '#00E5FF' } }}
          />
        }
        label={
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Isochrone
          </Typography>
        }
        sx={{ ml: 0, mb: enabled ? 1.5 : 0 }}
      />

      {enabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Travel mode */}
          <Box>
            <Typography
              sx={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.25)',
                mb: 0.5,
                display: 'block',
              }}
            >
              Travel mode
            </Typography>
            <ToggleButtonGroup
              value={profile}
              exclusive
              onChange={handleProfileChange}
              size="small"
              sx={{ width: '100%' }}
            >
              <ToggleButton value="walking" sx={{ flex: 1, py: 0.5 }} title="Walking">
                <DirectionsWalkIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="cycling" sx={{ flex: 1, py: 0.5 }} title="Cycling">
                <DirectionsBikeIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="driving" sx={{ flex: 1, py: 0.5 }} title="Driving">
                <DirectionsCarIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Max time preset */}
          <Box>
            <Typography
              sx={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.25)',
                mb: 0.5,
                display: 'block',
              }}
            >
              Max time (minutes)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {TIME_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  label={preset}
                  size="small"
                  clickable
                  onClick={() => handlePresetClick(preset)}
                  variant={maxMinutes === preset ? 'filled' : 'outlined'}
                  sx={{
                    borderColor: '#00E5FF',
                    color: maxMinutes === preset ? '#121212' : '#00E5FF',
                    bgcolor: maxMinutes === preset ? '#00E5FF' : 'transparent',
                    '&:hover': { bgcolor: maxMinutes === preset ? '#00A8C0' : 'rgba(0,229,255,0.08)' },
                    fontSize: '0.75rem',
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Status row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
            {loading && <CircularProgress size={14} sx={{ color: '#00E5FF' }} />}
            {!loading && !error && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                {origin !== null
                  ? 'Click elsewhere to reanalyse'
                  : 'Click the map to analyse reachability'}
              </Typography>
            )}
            {error && (
              <Typography variant="caption" sx={{ color: 'error.main' }}>
                {error}
              </Typography>
            )}
          </Box>

          {/* Results — POIs within each contour band */}
          <IsochroneResultsPanel />
        </Box>
      )}
    </Box>
  );
}

export default IsochroneControls;
