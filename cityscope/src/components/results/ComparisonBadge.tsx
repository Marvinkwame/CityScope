import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { MONO, ROLE } from '../../theme';
import { compareToCity } from './comparison';

/**
 * Density against the city's average district. Both directions use the
 * answer colour: density is neither good nor bad, so it is never green or red.
 */
function ComparisonBadge({ pct, cityAvgDensity }: { pct: number | null; cityAvgDensity: number }) {
  const c = compareToCity(pct, cityAvgDensity);

  return (
    <Box
      role="img"
      aria-label={c.label}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: '5px',
        border: `1px solid ${alpha(ROLE.answer, 0.35)}`,
        background: alpha(ROLE.answer, 0.08),
        mb: 2,
      }}
    >
      <Typography component="span" sx={{ fontFamily: MONO, fontSize: '0.72rem', color: ROLE.answer }}>
        {c.delta ? `${c.arrow} ${c.delta}` : c.arrow}
      </Typography>
      <Typography component="span" sx={{ fontFamily: MONO, fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
        {c.context}
      </Typography>
    </Box>
  );
}

export default ComparisonBadge;
