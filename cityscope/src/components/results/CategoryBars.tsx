import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MONO, ROLE } from '../../theme';
import CategoryIcon from './CategoryIcon';
import SectionLabel from './SectionLabel';
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
      <SectionLabel>{title}</SectionLabel>
      <Box role="list" aria-label={title}>
        {rows.map((row) => (
          <Box
            key={row.category}
            role="listitem"
            aria-label={barLabel(row)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              alignItems: 'center',
              columnGap: 1,
              rowGap: 0.5,
              mb: 1.1,
            }}
          >
            <CategoryIcon category={row.category} />
            <Typography aria-hidden sx={{ fontSize: '0.78rem' }}>
              {categoryLabel(row.category)}
            </Typography>
            <Typography aria-hidden sx={{ fontFamily: MONO, fontSize: '0.7rem', color: 'rgba(255,255,255,0.92)' }}>
              {formatCount(row.count)}
              <Box component="span" sx={{ color: 'rgba(255,255,255,0.4)', ml: 0.75 }}>
                {formatShare(row.share)}
              </Box>
            </Typography>
            <Box
              aria-hidden
              sx={{ gridColumn: '2 / 4', height: 4, borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}
            >
              <Box
                sx={{ width: `${row.barPct}%`, height: '100%', borderRadius: '2px', background: ROLE.answer, opacity: 0.85 }}
              />
            </Box>
          </Box>
        ))}
      </Box>
      {moreCount > 0 && (
        <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
          + {moreCount} more {moreCount === 1 ? 'category' : 'categories'}
        </Typography>
      )}
    </Box>
  );
}

export default CategoryBars;
