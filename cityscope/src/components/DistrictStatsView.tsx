import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useDistrictStats } from '../hooks/useDistrictStats';
import { ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import ComparisonBadge from './results/ComparisonBadge';
import StatRow from './results/StatRow';
import { formatCount } from './results/format';

function DistrictStatsView({ cityId, districtId }: { cityId: string; districtId: string | number }) {
  const { data, isLoading, isError } = useDistrictStats(cityId, districtId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={20} sx={{ color: ROLE.answer }} />
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

  return (
    <Box sx={{ mt: 0.5 }}>
      <StatRow
        stats={[
          { label: 'POIs', value: formatCount(data.poiCount) },
          { label: 'Area', value: data.areaKm2.toFixed(1), unit: 'km²' },
          { label: 'Density', value: formatCount(data.densityPerKm2), unit: '/km²' },
        ]}
      />
      {data.poiCount > 0 ? (
        <>
          <ComparisonBadge pct={data.densityVsCityPct} cityAvgDensity={data.cityAvgDensity} />
          <CategoryBars counts={data.topCategories} total={data.poiCount} />
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
