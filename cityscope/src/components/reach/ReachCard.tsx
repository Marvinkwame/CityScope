import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import HexagonOutlinedIcon from '@mui/icons-material/HexagonOutlined';
import { alpha, useTheme } from '@mui/material/styles';
import { useReachCard } from '../../hooks/useReachCard';
import { useReachPayload } from '../../hooks/useReachPayload';
import { useReachStore } from '../../store/reachStore';
import { ReachCellNotFoundError } from '../../lib/reach/api';
import { cardIsStale, cardRows } from '../../lib/reach/card';
import type { CellCard, ReachProperties } from '../../lib/reach/model';
import { MONO, ROLE } from '../../theme';
import MapCardSlot from '../MapCardSlot';
import { formatCount } from '../results/format';
import ReachBlockRows from './ReachBlockRows';
import ReachCityHeadline from './ReachCityHeadline';

/** A block as the card shows it: the payload's numbers, and the endpoint's places once they arrive. */
interface ShownBlock {
  props: ReachProperties;
  k: number;
  card: CellCard | undefined;
}

const NOTE_SX = { fontSize: '0.64rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.5)' } as const;

function clearBlock() {
  useReachStore.getState().selectCell(null);
}

function BlockTitle({ residents }: { residents: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      {/* Gold, as the block's outline on the map is. */}
      <HexagonOutlinedIcon aria-hidden sx={{ fontSize: 14, color: ROLE.you }} />
      <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700, fontSize: 12 }}>
        This block · about {formatCount(residents)} residents
      </Typography>
    </Box>
  );
}

/**
 * The selected block's nearest everyday places. On phones it is the one bottom
 * card, so with no block selected it shows the city's headline instead.
 */
function ReachCard() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const reachOn = useReachStore((s) => s.enabled);
  const minutes = useReachStore((s) => s.minutes);
  const needs = useReachStore((s) => s.needs);
  const selectedCell = useReachStore((s) => s.selectedCell);
  const { availability, data: payload } = useReachPayload();
  const cardQuery = useReachCard();

  const props = useMemo(
    () =>
      payload && selectedCell
        ? (payload.features.find((f) => f.properties.h === selectedCell)?.properties ?? null)
        : null,
    [payload, selectedCell],
  );
  const k = payload?.meta.metresPerMinute;
  const card = props ? cardQuery.data : undefined;

  // The last block shown, so the desktop card keeps its content while it
  // slides away after the block is cleared.
  const [lastBlock, setLastBlock] = useState<ShownBlock | null>(null);
  if (props && k !== undefined && (lastBlock?.props !== props || lastBlock.k !== k || lastBlock.card !== card)) {
    setLastBlock({ props, k, card });
  }
  const live: ShownBlock | null = props && k !== undefined ? { props, k, card } : null;
  const block = live ?? (isPhone ? null : lastBlock);

  const ready = reachOn && availability === 'ready';
  const visible = ready && (isPhone || live !== null);

  const loading = live !== null && cardQuery.isLoading;
  const failed = live !== null && !card && cardQuery.isError && !(cardQuery.error instanceof ReachCellNotFoundError);

  return (
    <MapCardSlot visible={visible}>
      {block ? (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {isPhone ? (
              <Button
                size="small"
                startIcon={<ArrowBackIcon />}
                onClick={clearBlock}
                sx={{
                  color: ROLE.you,
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  px: 0.75,
                  ml: -0.75,
                  minWidth: 0,
                  '&:hover': { background: alpha(ROLE.you, 0.08) },
                }}
              >
                Back to the city
              </Button>
            ) : (
              <>
                <BlockTitle residents={block.props.r} />
                <IconButton
                  size="small"
                  onClick={clearBlock}
                  aria-label="Close block card"
                  sx={{ color: 'rgba(255,255,255,0.4)', p: 0.25 }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </>
            )}
          </Box>

          <Box sx={{ px: 1.25, py: 1, maxHeight: '60vh', overflowY: 'auto' }}>
            {isPhone && (
              <Box sx={{ mb: 0.75 }}>
                <BlockTitle residents={block.props.r} />
              </Box>
            )}
            {loading && (
              <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', mb: 0.5 }}>
                Loading this block…
              </Typography>
            )}
            {failed && (
              <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: 'error.main', mb: 0.5 }}>
                Couldn&apos;t load this block&apos;s places
              </Typography>
            )}
            <ReachBlockRows rows={cardRows(block.card, block.props, block.k, minutes, needs)} />
            {block.card && cardIsStale(block.card, block.props, block.k) && (
              <Typography sx={{ ...NOTE_SX, mt: 1 }}>
                This block&apos;s data has changed since the map loaded. Reload to update.
              </Typography>
            )}
            <Typography sx={{ ...NOTE_SX, fontFamily: MONO, fontSize: '0.6rem', mt: 1 }}>
              Estimated walking times, measured from the block&apos;s centre
            </Typography>
          </Box>
        </>
      ) : (
        isPhone && <ReachCityHeadline />
      )}
    </MapCardSlot>
  );
}

export default ReachCard;
