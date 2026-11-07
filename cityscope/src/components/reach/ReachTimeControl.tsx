import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { RECOLOUR_ON_RELEASE } from '../../lib/reach/config';
import { isReachMinutes } from '../../lib/reach/model';
import type { ReachMinutes } from '../../lib/reach/model';
import { BODY, MONO } from '../../theme';

const WORD_SX = { fontFamily: BODY, fontSize: '0.78rem', color: 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap' } as const;

function asMinutes(v: number | number[]): ReachMinutes | null {
  return typeof v === 'number' && isReachMinutes(v) ? v : null;
}

/**
 * "Within [time] minutes of": a slider over the city's stops, or plain text
 * when it offers only one (a slider can't have min === max).
 *
 * With RECOLOUR_ON_RELEASE, dragging only previews the time (the headline
 * follows it live) and the store, and so the map, takes it on release.
 */
function ReachTimeControl({
  stops,
  value,
  onPreview,
  onCommit,
}: {
  stops: readonly ReachMinutes[];
  value: ReachMinutes;
  onPreview: (minutes: ReachMinutes) => void;
  onCommit: (minutes: ReachMinutes) => void;
}) {
  if (stops.length < 2) {
    return (
      <Typography sx={WORD_SX}>
        Within{' '}
        <Box component="span" sx={{ fontFamily: MONO, fontSize: '0.72rem', color: 'rgba(255,255,255,0.92)' }}>
          {stops[0] ?? value} minutes
        </Box>{' '}
        of
      </Typography>
    );
  }

  return (
    // The mark labels hang below the slider, so the row pads for them.
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 2.25 }}>
      <Typography sx={WORD_SX}>Within</Typography>
      <Slider
        size="small"
        min={stops[0]}
        max={stops[stops.length - 1]}
        step={null}
        marks={stops.map((s) => ({ value: s, label: String(s) }))}
        value={value}
        aria-label="Time limit"
        getAriaValueText={(v) => `${v} minutes`}
        onChange={(_event, v) => {
          const m = asMinutes(v);
          if (m === null) return;
          if (RECOLOUR_ON_RELEASE) onPreview(m);
          else onCommit(m);
        }}
        onChangeCommitted={(_event, v) => {
          const m = asMinutes(v);
          if (m !== null && RECOLOUR_ON_RELEASE) onCommit(m);
        }}
        sx={{
          flex: 1,
          mb: 0,
          '& .MuiSlider-markLabel': { fontFamily: MONO, fontSize: '0.58rem', color: 'rgba(255,255,255,0.40)' },
          '& .MuiSlider-markLabelActive': { color: 'rgba(255,255,255,0.85)' },
        }}
      />
      <Typography sx={WORD_SX}>minutes of</Typography>
    </Box>
  );
}

export default ReachTimeControl;
