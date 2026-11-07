import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MONO } from '../../theme';
import BarRows from './BarRows';
import { barLabel, toBars, type CategoryCounts } from './bars';
import { categoryLabel, formatCount, formatShare } from './format';

/**
 * The top categories as bars. Each row has an icon, the name, the count, the
 * share of all places, and a bar scaled to the largest category, so the
 * proportions that chips used to hide are visible at a glance.
 */
function CategoryBars({
  counts,
  total,
  title = 'Top categories',
}: {
  counts: CategoryCounts;
  total: number;
  title?: string;
}) {
  const { rows, moreCount } = toBars(counts, total);
  if (rows.length === 0) return null;

  return (
    <Box>
      <BarRows
        title={title}
        rows={rows.map((row) => ({
          key: row.category,
          iconCategory: row.category,
          label: categoryLabel(row.category),
          value: formatCount(row.count),
          detail: formatShare(row.share),
          barPct: row.barPct,
          srLabel: barLabel(row),
        }))}
      />
      {moreCount > 0 && (
        <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
          + {moreCount} more {moreCount === 1 ? 'category' : 'categories'}
        </Typography>
      )}
    </Box>
  );
}

export default CategoryBars;
