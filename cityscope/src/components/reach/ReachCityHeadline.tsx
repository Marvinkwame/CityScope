import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TuneIcon from '@mui/icons-material/Tune';
import { alpha } from '@mui/material/styles';
import { useReachSummary } from '../../hooks/useReachSummary';
import { useReachStore } from '../../store/reachStore';
import { useUIStore } from '../../store/uiStore';
import { coverageLine, headlineSentence, percent, rangeLine } from '../../lib/reach/copy';
import { MONO, ROLE } from '../../theme';

/**
 * The phone card's city view: the headline the sidebar panel leads with (the
 * figure, its sentence and its range), and a way into the sidebar to change
 * it. A component of its own so the summary pass runs only on phones, while no
 * block is selected.
 */
function ReachCityHeadline() {
  const reach = useReachSummary();
  const needs = useReachStore((s) => s.needs);
  const minutes = useReachStore((s) => s.minutes);
  if (!reach) return null;

  return (
    <Box sx={{ px: 1.25, py: 1 }}>
      <Typography sx={{ fontFamily: MONO, fontSize: '0.58rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.58)' }}>
        {coverageLine(reach.meta)}
      </Typography>
      {/* Announced as it changes, as the sidebar's headline is. */}
      <Box
        aria-live="polite"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, borderLeft: `2px solid ${ROLE.answer}`, pl: 1 }}
      >
        <Typography sx={{ fontFamily: MONO, fontSize: '1.6rem', fontWeight: 600, lineHeight: 1.05, color: ROLE.answer }}>
          {percent(reach.summary.share)}
        </Typography>
        <Box>
          <Typography sx={{ fontSize: '0.72rem', lineHeight: 1.4, color: 'rgba(255,255,255,0.88)' }}>
            {headlineSentence(needs, minutes)}
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'rgba(255,255,255,0.66)', mt: 0.5 }}>
            {rangeLine(reach.summary.low, reach.summary.high)}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Button
          size="small"
          startIcon={<TuneIcon />}
          onClick={() => useUIStore.getState().setSidebarOpen(true)}
          aria-label="Adjust time and needs"
          sx={{
            color: ROLE.you,
            textTransform: 'none',
            fontSize: '0.75rem',
            px: 0.75,
            minWidth: 0,
            '&:hover': { background: alpha(ROLE.you, 0.08) },
          }}
        >
          Adjust
        </Button>
      </Box>
    </Box>
  );
}

export default ReachCityHeadline;
