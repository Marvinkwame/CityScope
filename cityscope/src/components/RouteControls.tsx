import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { useRouteStore } from '../store/routeStore';
import { useIsochroneStore } from '../store/isochroneStore';
import type { TravelProfile } from '../store/isochroneStore';
import { useDrawStore } from '../store/drawStore';
import { MONO } from '../theme';
import RouteResultsPanel from './RouteResultsPanel';

function RouteControls() {
  const enabled = useRouteStore((s) => s.enabled);
  const setMode = useRouteStore((s) => s.setMode);
  const origin = useRouteStore((s) => s.origin);
  const destination = useRouteStore((s) => s.destination);
  const profile = useRouteStore((s) => s.profile);
  const setEnabled = useRouteStore((s) => s.setEnabled);
  const setSetMode = useRouteStore((s) => s.setSetMode);
  const setOrigin = useRouteStore((s) => s.setOrigin);
  const setDestination = useRouteStore((s) => s.setDestination);
  const setProfile = useRouteStore((s) => s.setProfile);

  const handleToggle = (checked: boolean) => {
    if (checked) {
      useIsochroneStore.getState().setEnabled(false);
      useDrawStore.getState().setEnabled(false);
    }
    setEnabled(checked);
  };

  const handleProfileChange = (
    _: React.MouseEvent<HTMLElement>,
    newProfile: TravelProfile | null,
  ) => {
    if (newProfile) setProfile(newProfile);
  };

  const handleSetA = () => {
    setOrigin(null);
    setSetMode('origin');
  };

  const handleSetB = () => {
    setDestination(null);
    setSetMode('destination');
  };

  return (
    <Box sx={{ p: 1.25 }}>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            size="small"
          />
        }
        label={
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Route Planning
          </Typography>
        }
        sx={{ ml: 0, mb: enabled ? 1.5 : 0 }}
      />

      {enabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Set A / Set B pin buttons */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant={setMode === 'origin' ? 'contained' : 'outlined'}
              onClick={handleSetA}
              sx={{
                flex: 1,
                borderColor: '#4CAF50',
                color: setMode === 'origin' ? '#000' : '#4CAF50',
                bgcolor: setMode === 'origin' ? '#4CAF50' : 'transparent',
                '&:hover': {
                  bgcolor:
                    setMode === 'origin' ? '#43A047' : 'rgba(76,175,80,0.1)',
                  borderColor: '#4CAF50',
                },
              }}
            >
              Set A
            </Button>
            <Button
              size="small"
              variant={setMode === 'destination' ? 'contained' : 'outlined'}
              onClick={handleSetB}
              sx={{
                flex: 1,
                borderColor: '#FF7043',
                color: setMode === 'destination' ? '#000' : '#FF7043',
                bgcolor: setMode === 'destination' ? '#FF7043' : 'transparent',
                '&:hover': {
                  bgcolor:
                    setMode === 'destination'
                      ? '#F4511E'
                      : 'rgba(255,112,67,0.1)',
                  borderColor: '#FF7043',
                },
              }}
            >
              Set B
            </Button>
          </Box>

          {/* Travel mode */}
          <Box>
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: '0.58rem',
                fontWeight: 500,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.42)',
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

          {/* Pin status row */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Typography
              variant="caption"
              sx={{
                color: origin ? '#4CAF50' : '#555',
                fontStyle: origin ? 'normal' : 'italic',
              }}
            >
              A: {origin ? '✓ set' : 'click map…'}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: destination ? '#FF7043' : '#555',
                fontStyle: destination ? 'normal' : 'italic',
              }}
            >
              B: {destination ? '✓ set' : 'click map…'}
            </Typography>
          </Box>

          <RouteResultsPanel />
        </Box>
      )}
    </Box>
  );
}

export default RouteControls;
