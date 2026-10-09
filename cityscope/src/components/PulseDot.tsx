import Box from '@mui/material/Box';
import { alpha, keyframes } from '@mui/material/styles';
import { ROLE } from '../theme';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 ${alpha(ROLE.answer, 0.45)}; }
  100% { box-shadow: 0 0 0 6px ${alpha(ROLE.answer, 0)}; }
`;

/** A small cyan dot that pulses while the app is working. Decorative. */
function PulseDot() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        flexShrink: 0,
        background: ROLE.answer,
        animation: `${pulse} 1.6s ease-out infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    />
  );
}

export default PulseDot;
