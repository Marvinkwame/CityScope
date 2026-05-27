import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useRoute } from '../hooks/useRoute';
import { useRouteStore } from '../store/routeStore';

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

function maneuverArrow(type: string, modifier?: string): string {
  if (type === 'depart') return '↑';
  if (type === 'arrive') return '⚑';
  if (type === 'turn' || type === 'end of road') {
    if (modifier === 'right' || modifier === 'sharp right') return '↱';
    if (modifier === 'left' || modifier === 'sharp left') return '↰';
    if (modifier === 'uturn') return '↩';
  }
  return '↑';
}

function RouteResultsPanel() {
  const { data: routeData } = useRoute();

  if (!routeData) return null;

  return (
    <Box sx={{ mt: 1 }}>
      {/* Distance + Duration stats */}
      <Box
        sx={{
          display: 'flex',
          background: '#1e1e1e',
          borderRadius: 1.5,
          border: '1px solid #2a2a2a',
          overflow: 'hidden',
          mb: 1,
        }}
      >
        <Box sx={{ flex: 1, py: 1.5, textAlign: 'center' }}>
          <Typography sx={{ color: '#4FC3F7', fontWeight: 700, fontSize: '1.1rem' }}>
            {formatDistance(routeData.distanceM)}
          </Typography>
          <Typography variant="caption" sx={{ color: '#555' }}>
            distance
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem sx={{ borderColor: '#2a2a2a' }} />
        <Box sx={{ flex: 1, py: 1.5, textAlign: 'center' }}>
          <Typography sx={{ color: '#4FC3F7', fontWeight: 700, fontSize: '1.1rem' }}>
            {formatDuration(routeData.durationS)}
          </Typography>
          <Typography variant="caption" sx={{ color: '#555' }}>
            duration
          </Typography>
        </Box>
      </Box>

      {/* Turn-by-turn steps */}
      <Box
        sx={{
          maxHeight: 220,
          overflowY: 'auto',
          background: '#1a1a1a',
          borderRadius: 1.5,
          border: '1px solid #2a2a2a',
          mb: 1,
        }}
      >
        {routeData.steps.map((step, i) => (
          <Box
            key={`${i}-${step.maneuverType}-${step.distanceM}`}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderBottom:
                i < routeData.steps.length - 1 ? '1px solid #222' : 'none',
            }}
          >
            <Typography
              sx={{ color: '#4FC3F7', fontSize: '0.8rem', minWidth: 14, mt: 0.1 }}
            >
              {maneuverArrow(step.maneuverType, step.maneuverModifier)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: '#ccc', flex: 1, lineHeight: 1.4 }}
            >
              {step.instruction}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: '#555', whiteSpace: 'nowrap' }}
            >
              {formatDistance(step.distanceM)}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Clear button */}
      <Box sx={{ textAlign: 'center' }}>
        <IconButton
          size="small"
          onClick={() => useRouteStore.getState().reset()}
          sx={{ color: 'text.secondary', p: 0.25 }}
          aria-label="Clear route"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

export default RouteResultsPanel;
