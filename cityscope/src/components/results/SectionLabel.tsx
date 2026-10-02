import type { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import { MONO } from '../../theme';

/** The small uppercase heading above each part of a result panel. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        fontFamily: MONO,
        fontSize: '0.55rem',
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

export default SectionLabel;
