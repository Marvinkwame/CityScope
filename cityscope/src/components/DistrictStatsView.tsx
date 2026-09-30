import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useDistrictStats } from '../hooks/useDistrictStats';
import { alpha } from '@mui/material/styles';
import { AMBER, MONO, ROLE } from '../theme';


function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Box>
      <Typography
        sx={{ fontFamily: MONO, fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
      >
        {value}
        {unit ? (
          <Box component="span" sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', ml: 0.5 }}>
            {unit}
          </Box>
        ) : null}
      </Typography>
      <Typography
        sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mt: 0.25 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function DistrictStatsView({ cityId, districtId }: { cityId: string; districtId: string | number }) {
  const { data, isLoading, isError } = useDistrictStats(cityId, districtId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={20} sx={{ color: AMBER }} />
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Couldn't load district statistics.
      </Typography>
    );
  }

  const pct = data.densityVsCityPct;
  const hasPois = data.poiCount > 0;
  // Density above or below average is neither good nor bad, so both directions
  // use the answer colour; the sign carries the direction.
  const pctColor = pct === null ? 'rgba(255,255,255,0.5)' : ROLE.answer;
  const pctLabel =
    pct === null ? '~ city avg' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}% vs city avg`;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 3, mt: 0.5, mb: 2 }}>
        <Stat label="POIs" value={String(data.poiCount)} />
        <Stat label="Area" value={data.areaKm2.toFixed(1)} unit="km²" />
        <Stat label="Density" value={data.densityPerKm2.toFixed(0)} unit="/km²" />
      </Box>

      {hasPois ? (
        <>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderRadius: '5px',
              border: `1px solid ${alpha(pctColor, 0.33)}`,
              background: alpha(pctColor, 0.08),
              mb: 2,
            }}
          >
            <Typography sx={{ fontFamily: MONO, fontSize: '0.72rem', color: pctColor }}>
              {pctLabel}
            </Typography>
          </Box>

          <Typography
            sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mb: 1 }}
          >
            Top categories
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {data.topCategories.map((c) => (
              <Chip
                key={c.category}
                label={`${c.category} · ${c.count}`}
                size="small"
                sx={{
                  fontFamily: MONO,
                  fontSize: '0.7rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.8)',
                }}
              />
            ))}
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No POIs in this district.
        </Typography>
      )}
    </Box>
  );
}

export default DistrictStatsView;
