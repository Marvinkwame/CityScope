import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useCities } from '../hooks/useCities';
import { useServerStatus } from '../hooks/useServerStatus';
import { EXAMPLES, type Example } from '../lib/examples';
import { applyShareState } from '../lib/shareState';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { AMBER, DISPLAY, INK, INK_2, MONO, ROLE } from '../theme';
import PulseDot from './PulseDot';

const TITLE_ID = 'welcome-title';

/**
 * The first-visit card: what CityScope is, three one-click examples, and the
 * cold-start status. It needs no server, so it appears before the API answers
 * and turns the free-tier wake-up into reading time.
 */
function WelcomeDialog() {
  const open = useUIStore((s) => s.welcomeOpen);
  const close = useUIStore((s) => s.closeWelcome);
  const { data: cities } = useCities();
  const { status, retry } = useServerStatus();
  const ready = status === 'ready';

  const choose = (example: Example) => {
    const map = useMapStore.getState().map;
    if (!map || !cities) return;
    applyShareState(example.state, map, cities);
    // The isochrone and drawn-area results live in the sidebar, which starts
    // closed on phones; open it so the answer is visible, not just the shape.
    if (example.state.tool) useUIStore.getState().setSidebarOpen(true);
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      aria-labelledby={TITLE_ID}
      slotProps={{
        backdrop: { sx: { background: alpha(INK, 0.62), backdropFilter: 'blur(1.5px)' } },
        paper: {
          sx: {
            width: 'min(92vw, 380px)',
            m: 0,
            p: 2.25,
            background: INK_2,
            backgroundImage: 'none',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
          },
        },
      }}
    >
      <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '1.6px', color: AMBER }}>
        CITYSCOPE
      </Typography>
      <Typography
        id={TITLE_ID}
        component="h2"
        sx={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '1.3rem', lineHeight: 1.2, mt: 0.75, mb: 0.75 }}
      >
        See how dense — and how reachable — a city really is.
      </Typography>
      <Typography sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, mb: 1.75 }}>
        Real OpenStreetMap data for 8 cities, analysed live with PostGIS.
      </Typography>

      <Box component="ul" role="list" aria-label="Examples" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
        {EXAMPLES.map((example) => {
          const Icon = example.icon;
          return (
            <li key={example.id}>
              <ButtonBase
                disabled={!ready}
                onClick={() => choose(example)}
                sx={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '22px 1fr',
                  columnGap: 1.1,
                  rowGap: 0.25,
                  alignItems: 'center',
                  justifyContent: 'stretch',
                  textAlign: 'left',
                  px: 1.1,
                  py: 1,
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '7px',
                  transition: 'opacity 0.2s, border-color 0.15s, background 0.15s',
                  '&.Mui-disabled': { opacity: 0.55 },
                  '&:hover': { borderColor: alpha(ROLE.you, 0.45), background: alpha(ROLE.you, 0.06) },
                  '&.Mui-focusVisible': { outline: `1px solid ${alpha(ROLE.you, 0.6)}` },
                }}
              >
                <Icon aria-hidden sx={{ gridRow: '1 / 3', fontSize: 20, color: ROLE.you }} />
                <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {example.title}
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.3px', color: 'rgba(255,255,255,0.45)' }}
                >
                  {example.kicker}
                </Typography>
              </ButtonBase>
            </li>
          );
        })}
      </Box>

      <Box role="status" aria-live="polite" sx={{ mt: 1.5, minHeight: 20 }}>
        {status === 'waking' && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ pt: '5px' }}>
              <PulseDot />
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', lineHeight: 1.5, color: ROLE.answer }}>
              Waking up the analysis server. Free hosting sleeps when idle, so this can take up to 30 s.
            </Typography>
          </Box>
        )}
        {status === 'error' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', color: 'error.main' }}>
              Couldn't reach the server
            </Typography>
            <Button
              size="small"
              onClick={retry}
              sx={{ color: ROLE.you, textTransform: 'none', minWidth: 0, px: 0.75, fontSize: '0.72rem' }}
            >
              Retry
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Button
          size="small"
          onClick={close}
          sx={{
            color: ROLE.you,
            textTransform: 'none',
            fontFamily: MONO,
            fontSize: '0.68rem',
            '&:hover': { background: alpha(ROLE.you, 0.08) },
          }}
        >
          Explore on my own →
        </Button>
      </Box>
    </Dialog>
  );
}

export default WelcomeDialog;
