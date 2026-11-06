import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { alpha } from '@mui/material/styles';
import { flyToPlace } from '../../lib/flyToPlace';
import type { CardRowView } from '../../lib/reach/card';
import { MONO, ROLE } from '../../theme';
import CategoryIcon from '../results/CategoryIcon';

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

const ROW_SX = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 0.75,
  py: 0.5,
  px: 0.5,
  borderRadius: 0.5,
  textAlign: 'left',
} as const;

const MARK_SIZE = 15;

/** ✓ or ✗ against the limit, with its word for screen readers. An unchosen need keeps the space, unmarked. */
function Mark({ within }: { within: boolean | null }) {
  if (within === null) {
    return (
      <Box component="span" sx={{ width: MARK_SIZE, flexShrink: 0 }}>
        <Box component="span" sx={VISUALLY_HIDDEN}>
          not chosen
        </Box>
      </Box>
    );
  }
  return (
    <Box component="span" sx={{ display: 'flex', flexShrink: 0 }}>
      {within ? (
        <CheckCircleIcon aria-hidden sx={{ fontSize: MARK_SIZE, color: ROLE.answer }} />
      ) : (
        <CancelIcon aria-hidden sx={{ fontSize: MARK_SIZE, color: 'rgba(255,255,255,0.45)' }} />
      )}
      <Box component="span" sx={VISUALLY_HIDDEN}>
        {within ? 'within' : 'not within'}
      </Box>
    </Box>
  );
}

function RowContent({ row }: { row: CardRowView }) {
  return (
    <>
      <CategoryIcon category={row.iconCategory} size={14} />
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.6rem', lineHeight: 1.3, color: 'rgba(255,255,255,0.62)' }}>
          {row.label}
        </Typography>
        {/* Empty while the card loads; the space is kept so the row doesn't grow. */}
        <Typography
          component="span"
          noWrap
          sx={{ display: 'block', fontSize: '0.74rem', lineHeight: 1.35, color: 'rgba(255,255,255,0.88)' }}
        >
          {row.name || ' '}
        </Typography>
      </Box>
      <Typography
        component="span"
        sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'rgba(255,255,255,0.76)', flexShrink: 0 }}
      >
        {row.minutesText}
      </Typography>
      <Mark within={row.within} />
    </>
  );
}

/**
 * One row per need: icon, need, place, minutes and a mark. A chosen need
 * outside the limit flies the map to its place; unchosen needs are dimmed.
 */
function ReachBlockRows({ rows }: { rows: ReadonlyArray<CardRowView> }) {
  return (
    <Box
      component="ul"
      // Safari/VoiceOver drop list semantics when list-style is none.
      role="list"
      aria-label="Nearest everyday places"
      sx={{ listStyle: 'none', m: 0, p: 0 }}
    >
      {rows.map((row) => {
        const place = row.within === false ? row.place : null;
        return (
          <Box
            component="li"
            key={row.need}
            // At 60% a dimmed row's place name and minutes stay near 4.5:1 or above on the card.
            sx={{ position: 'relative', opacity: row.chosen ? undefined : 0.6 }}
          >
            {place ? (
              <ButtonBase
                disableRipple
                onClick={() => flyToPlace(place.lng, place.lat)}
                aria-label={`${row.label}: ${row.name}, ${row.minutesText}, not within. Show on map`}
                sx={{
                  ...ROW_SX,
                  '&:hover': { background: 'rgba(255,255,255,0.04)' },
                  '&.Mui-focusVisible': { outline: `1px solid ${alpha(ROLE.you, 0.6)}` },
                }}
              >
                <RowContent row={row} />
              </ButtonBase>
            ) : (
              <Box sx={ROW_SX}>
                <RowContent row={row} />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export default ReachBlockRows;
