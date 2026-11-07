import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MONO, ROLE } from '../../theme';
import CategoryIcon from './CategoryIcon';
import SectionLabel from './SectionLabel';
import type { BarRowView } from './bars';

/** Read by screen readers, invisible on screen. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * A titled list of bars. Each row has an icon, the name, a figure with an
 * optional quieter one beside it, and a bar underneath.
 */
function BarRows({ title, rows }: { title: string; rows: ReadonlyArray<BarRowView> }) {
  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      <Box role="list" aria-label={title}>
        {rows.map((row) => (
          <Box
            key={row.key}
            role="listitem"
            sx={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              alignItems: 'center',
              columnGap: 1,
              rowGap: 0.5,
              mb: 1.1,
              // Half strength keeps a dimmed row's text near 4.5:1 on the panel.
              opacity: row.dimmed ? 0.5 : undefined,
            }}
          >
            {/* The row's text for screen readers. The visible parts below are
                aria-hidden, so a reader that ignores a list item's aria-label
                still gets the whole sentence. */}
            <Box component="span" sx={VISUALLY_HIDDEN}>
              {row.srLabel}
            </Box>
            <CategoryIcon category={row.iconCategory} />
            <Typography aria-hidden sx={{ fontSize: '0.78rem' }}>
              {row.label}
            </Typography>
            <Typography aria-hidden sx={{ fontFamily: MONO, fontSize: '0.7rem', color: 'rgba(255,255,255,0.92)' }}>
              {row.value}
              {row.detail !== undefined && (
                <Box component="span" sx={{ color: 'rgba(255,255,255,0.4)', ml: 0.75 }}>
                  {row.detail}
                </Box>
              )}
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
    </>
  );
}

export default BarRows;
