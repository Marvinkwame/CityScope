import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { reachLegend } from '../../lib/reach/expressions';
import { REACH_FILL_OPACITY, SURFACE } from '../../theme';
import SectionLabel from '../results/SectionLabel';

/** A flat-topped hexagon, the shape of a block on the map. */
const HEXAGON = '4,0.5 12,0.5 15.5,7 12,13.5 4,13.5 0.5,7';

/**
 * The map's classes, each named in words beside its swatch. The swatches sit
 * on the basemap's land tint at the fill's opacity, so they look like the map.
 */
function ReachLegend({ needCount }: { needCount: number }) {
  const title = 'Blocks on the map';
  return (
    <Box>
      <SectionLabel>{title}</SectionLabel>
      <Box
        component="ul"
        aria-label={title}
        sx={{
          listStyle: 'none',
          m: 0,
          px: 1.25,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          background: SURFACE.land,
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '6px',
        }}
      >
        {reachLegend(needCount).map(({ cls, label, colour }) => (
          <Box component="li" key={cls} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <svg width={16} height={14} viewBox="0 0 16 14" aria-hidden focusable="false">
              {/* A faint edge, so the darkest class still shows its shape. */}
              <polygon points={HEXAGON} fill={colour} fillOpacity={REACH_FILL_OPACITY} stroke="rgba(255,255,255,0.14)" />
            </svg>
            <Typography sx={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.78)' }}>{label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default ReachLegend;
