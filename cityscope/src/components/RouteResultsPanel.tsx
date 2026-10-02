import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useRoute } from '../hooks/useRoute';
import { useRouteStore } from '../store/routeStore';
import { MONO, ROLE } from '../theme';
import StatRow, { type StatItem } from './results/StatRow';
import { distanceParts, formatDistance } from './results/format';

/** "45 min", or "1h 17m" / "2h" from an hour up. */
function durationStat(seconds: number): StatItem {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return { label: 'Duration', value: String(mins), unit: 'min' };
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return { label: 'Duration', value: rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m` };
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

  const distance = distanceParts(routeData.distanceM);

  return (
    <Box sx={{ mt: 1 }}>
      <StatRow
        stats={[
          { label: 'Distance', value: distance.value, unit: distance.unit },
          durationStat(routeData.durationS),
        ]}
      />

      {/* Turn-by-turn steps */}
      <Box
        sx={{
          maxHeight: 220,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.07)',
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
                i < routeData.steps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}
          >
            <Typography
              sx={{
                fontFamily: MONO,
                color: ROLE.answer,
                fontSize: '0.8rem',
                minWidth: 14,
                mt: 0.1,
              }}
            >
              {maneuverArrow(step.maneuverType, step.maneuverModifier)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.75)', flex: 1, lineHeight: 1.4 }}
            >
              {step.instruction}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: MONO, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}
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
