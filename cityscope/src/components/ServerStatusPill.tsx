import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useServerStatus } from '../hooks/useServerStatus';
import { useUIStore } from '../store/uiStore';
import { INK_1, MONO, ROLE } from '../theme';
import PulseDot from './PulseDot';

/** Only a noticeable wait earns the pill, so a warm server never flashes it. */
const SHOW_AFTER_MS = 1500;

/**
 * The cold-start status for visitors who don't see the welcome card. While
 * the card is open it shows the same status itself, so the pill stays away.
 */
function ServerStatusPill() {
  const welcomeOpen = useUIStore((s) => s.welcomeOpen);
  const { status, retry } = useServerStatus();
  const [slow, setSlow] = useState(false);

  // `slow` deliberately never resets: after Retry the status goes error ->
  // waking, and the pill should show progress at once instead of waiting
  // another 1.5 s.
  useEffect(() => {
    if (status !== 'waking') return;
    const timer = setTimeout(() => setSlow(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (welcomeOpen || status === 'ready') return null;
  if (status === 'waking' && !slow) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'absolute',
        left: '50%',
        bottom: { xs: 40, sm: 32 },
        transform: 'translateX(-50%)',
        zIndex: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        maxWidth: 'calc(100vw - 24px)',
        borderRadius: '999px',
        background: alpha(INK_1, 0.92),
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      }}
    >
      {status === 'waking' ? (
        <>
          <PulseDot />
          <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: ROLE.answer, whiteSpace: 'nowrap' }}>
            Waking up the analysis server — up to 30 s
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'error.main', whiteSpace: 'nowrap' }}>
            Couldn't reach the server
          </Typography>
          <Button
            size="small"
            onClick={retry}
            sx={{ color: ROLE.you, textTransform: 'none', minWidth: 0, px: 0.75, py: 0, minHeight: 32, fontSize: '0.7rem' }}
          >
            Retry
          </Button>
        </>
      )}
    </Box>
  );
}

export default ServerStatusPill;
