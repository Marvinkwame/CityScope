import { useEffect, useId, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import ToggleButton from '@mui/material/ToggleButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { alpha } from '@mui/material/styles';
import { useReachPayload } from '../../hooks/useReachPayload';
import { useReachSummary } from '../../hooks/useReachSummary';
import { useReachStore } from '../../store/reachStore';
import { coverageLine, headlineSentence, needBarRows, percent, rangeExplanation, rangeLine } from '../../lib/reach/copy';
import { REACH_NEEDS, pickStop } from '../../lib/reach/model';
import type { NeedId, ReachMinutes } from '../../lib/reach/model';
import { BODY, MONO, ROLE } from '../../theme';
import BarRows from '../results/BarRows';
import CategoryIcon from '../results/CategoryIcon';
import ReachLegend from './ReachLegend';
import ReachMethodNote from './ReachMethodNote';
import ReachTimeControl from './ReachTimeControl';

const PANEL_SX = {
  mt: 0.5,
  mb: 1,
  p: 1.5,
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.02)',
} as const;

/** A text button in the you colour, as the other panels' actions are. */
const ACTION_SX = {
  color: ROLE.you,
  textTransform: 'none',
  fontSize: '0.75rem',
  px: 0.75,
  minWidth: 0,
  '&:hover': { background: alpha(ROLE.you, 0.08) },
} as const;

/** Six toggles, two rows of three. The last chosen need can't be turned off. */
function NeedToggles({ needs, onToggle }: { needs: readonly NeedId[]; onToggle: (id: NeedId) => void }) {
  return (
    <Box>
      <Box role="group" aria-label="Everyday needs" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
        {REACH_NEEDS.map(({ id, label, iconCategory }) => {
          const selected = needs.includes(id);
          return (
            <ToggleButton
              key={id}
              value={id}
              size="small"
              selected={selected}
              disabled={selected && needs.length === 1}
              onChange={() => onToggle(id)}
              sx={{
                flexDirection: 'column',
                gap: 0.25,
                px: 0.5,
                py: 0.6,
                borderRadius: '6px',
                fontFamily: BODY,
                fontSize: '0.66rem',
                lineHeight: 1.2,
                textTransform: 'none',
                // The icon takes the button's colour: gold when chosen.
                '& .MuiSvgIcon-root': { color: 'inherit' },
              }}
            >
              <CategoryIcon category={iconCategory} size={16} />
              {label}
            </ToggleButton>
          );
        })}
      </Box>
      {needs.length === 1 && (
        <Typography sx={{ fontFamily: MONO, fontSize: '0.56rem', color: 'rgba(255,255,255,0.40)', mt: 0.75 }}>
          At least one need stays chosen
        </Typography>
      )}
    </Box>
  );
}

/**
 * Everyday reach for the city: who lives within the chosen time of the chosen
 * needs, the controls that change it, the map's key, and how it is measured.
 */
function ReachPanel() {
  const { availability, data, refetch, isFetching } = useReachPayload();
  const minutes = useReachStore((s) => s.minutes);
  const needs = useReachStore((s) => s.needs);
  const setEnabled = useReachStore((s) => s.setEnabled);
  const setMinutes = useReachStore((s) => s.setMinutes);
  const toggleNeed = useReachStore((s) => s.toggleNeed);

  // The time under the slider while it is dragged, before it is committed.
  const [preview, setPreview] = useState<ReachMinutes | null>(null);
  const reach = useReachSummary(preview ?? undefined);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const meta = data?.meta;

  // A city with no data, or one that failed the bar, can't keep the layer on.
  useEffect(() => {
    if (availability === 'not-built' || availability === 'not-reliable') setEnabled(false);
  }, [availability, setEnabled]);

  // Keep the time on a stop this city offers (a link may carry one it doesn't).
  useEffect(() => {
    if (!meta) return;
    const stop = pickStop(meta.stops, minutes);
    if (stop !== null && stop !== minutes) setMinutes(stop);
  }, [meta, minutes, setMinutes]);

  if (availability === 'error') {
    return (
      <Box sx={{ ...PANEL_SX, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'error.main' }}>
          Couldn&apos;t load Everyday reach
        </Typography>
        <Button size="small" onClick={() => void refetch()} disabled={isFetching} sx={ACTION_SX}>
          Retry
        </Button>
      </Box>
    );
  }

  // Loading shows on the switch; the other states turn the switch off.
  if (availability !== 'ready' || !reach) return null;

  const { meta: m, summary } = reach;
  const shownMinutes = preview ?? minutes;

  return (
    <Box sx={{ ...PANEL_SX, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.58)' }}>
        {coverageLine(m)}
      </Typography>

      {/* The headline is the answer, so it takes the answer colour and is announced as it changes. */}
      <Box aria-live="polite" sx={{ borderLeft: `2px solid ${ROLE.answer}`, pl: 1.25 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: '2rem', fontWeight: 600, lineHeight: 1.05, color: ROLE.answer }}>
          {percent(summary.share)}
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.4, color: 'rgba(255,255,255,0.88)', mt: 0.5 }}>
          {headlineSentence(needs, shownMinutes)}
        </Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'rgba(255,255,255,0.66)', mt: 0.75 }}>
          {rangeLine(summary.low, summary.high)}
        </Typography>
        <Typography sx={{ fontSize: '0.66rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.45)', mt: 0.25 }}>
          {rangeExplanation(m.kLow, m.kHigh)}
        </Typography>
      </Box>

      <Box>
        <ReachTimeControl
          stops={m.stops}
          value={shownMinutes}
          onPreview={setPreview}
          onCommit={(next) => {
            setPreview(null);
            setMinutes(next);
          }}
        />
        <NeedToggles needs={needs} onToggle={toggleNeed} />
      </Box>

      <Box>
        <BarRows title="Within the limit, by need" rows={needBarRows(summary.perNeed, needs)} />
      </Box>

      <ReachLegend needCount={needs.length} />

      <Box>
        <Button
          size="small"
          onClick={() => setNoteOpen((open) => !open)}
          aria-expanded={noteOpen}
          aria-controls={noteId}
          endIcon={noteOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ ...ACTION_SX, ml: -0.75 }}
        >
          How this is measured
        </Button>
        <Collapse id={noteId} in={noteOpen} timeout={reduceMotion ? 0 : undefined}>
          <ReachMethodNote meta={m} />
        </Collapse>
      </Box>
    </Box>
  );
}

export default ReachPanel;
