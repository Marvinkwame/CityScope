import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MONO } from '../../theme';

export interface StatItem {
  label: string;
  value: string;
  unit?: string;
}

/** Two or three headline numbers for a result, each with an optional unit and a label. */
function StatRow({ stats }: { stats: ReadonlyArray<StatItem> }) {
  return (
    <Box sx={{ display: 'flex', gap: 3, mb: 1.5 }}>
      {stats.map((s) => (
        <Box key={s.label}>
          <Typography
            sx={{ fontFamily: MONO, fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
          >
            {s.value}
            {s.unit ? (
              <Box component="span" sx={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(255,255,255,0.4)', ml: 0.5 }}>
                {s.unit}
              </Box>
            ) : null}
          </Typography>
          <Typography
            sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mt: 0.25 }}
          >
            {s.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default StatRow;
