import { useEffect, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import PublicIcon from '@mui/icons-material/Public';
import { useMapStore } from '../store/mapStore';
import { useCityStore } from '../store/cityStore';
import type { City } from '../store/cityStore';
import { useCities } from '../hooks/useCities';
import ShareButton from './ShareButton';
import { alpha } from '@mui/material/styles';
import { AMBER, CYAN, INK, INK_1, MONO, DISPLAY } from '../theme';

const NAV_HEIGHT = 56;

/** Reticle / registration mark — the recurring signature motif. */
function ReticleLogo() {
  const tick = {
    content: '""',
    position: 'absolute' as const,
    background: AMBER,
  };
  return (
    <Box
      sx={{
        width: 22,
        height: 22,
        position: 'relative',
        flexShrink: 0,
        // four registration ticks
        '&::before': { ...tick, top: '50%', left: -3, width: 5, height: '1px', transform: 'translateY(-50%)' },
        '&::after': { ...tick, top: '50%', right: -3, width: 5, height: '1px', transform: 'translateY(-50%)' },
      }}
    >
      {/* vertical ticks */}
      <Box sx={{ position: 'absolute', left: '50%', top: -3, width: '1px', height: 5, background: AMBER, transform: 'translateX(-50%)' }} />
      <Box sx={{ position: 'absolute', left: '50%', bottom: -3, width: '1px', height: 5, background: AMBER, transform: 'translateX(-50%)' }} />
      {/* outer ring */}
      <Box
        sx={{
          position: 'absolute',
          inset: 1,
          borderRadius: '50%',
          border: `1px solid ${alpha(AMBER, 0.55)}`,
        }}
      />
      {/* core dot */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: AMBER,
        }}
      />
    </Box>
  );
}

/** Live map-centre + zoom readout in instrument mono. */
function LiveReadout() {
  const map = useMapStore((s) => s.map);
  const selectedCity = useCityStore((s) => s.selectedCity);
  const [view, setView] = useState({
    lat: selectedCity.centerLat,
    lng: selectedCity.centerLng,
    zoom: selectedCity.defaultZoom,
  });

  useEffect(() => {
    if (!map) return;
    const sync = () => {
      const c = map.getCenter();
      setView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    sync();
    map.on('move', sync);
    return () => {
      map.off('move', sync);
    };
  }, [map]);

  const fmt = (n: number, dir: [string, string]) =>
    `${Math.abs(n).toFixed(4)}°${n >= 0 ? dir[0] : dir[1]}`;

  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        gap: 1.25,
        px: 1.25,
        py: 0.5,
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.025)',
        fontFamily: MONO,
        fontSize: '0.6rem',
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.75, color: 'rgba(255,255,255,0.55)' }}>
        <Box component="span" sx={{ color: 'rgba(255,255,255,0.30)' }}>LAT</Box>
        <Box component="span" sx={{ color: CYAN }}>{fmt(view.lat, ['N', 'S'])}</Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, color: 'rgba(255,255,255,0.55)' }}>
        <Box component="span" sx={{ color: 'rgba(255,255,255,0.30)' }}>LON</Box>
        <Box component="span" sx={{ color: CYAN }}>{fmt(view.lng, ['E', 'W'])}</Box>
      </Box>
      <Box sx={{ width: '1px', height: 12, background: 'rgba(255,255,255,0.1)' }} />
      <Box sx={{ display: 'flex', gap: 0.75, color: 'rgba(255,255,255,0.55)' }}>
        <Box component="span" sx={{ color: 'rgba(255,255,255,0.30)' }}>Z</Box>
        <Box component="span" sx={{ color: 'rgba(255,255,255,0.78)' }}>{view.zoom.toFixed(1)}</Box>
      </Box>
    </Box>
  );
}

function Navbar() {
  const is3D = useMapStore((state) => state.is3D);
  const toggle3D = useMapStore((state) => state.toggle3D);
  const selectedCity = useCityStore((state) => state.selectedCity);
  const setCity = useCityStore((state) => state.setCity);
  const { data: cities } = useCities();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        height: NAV_HEIGHT,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        background: alpha(INK_1, 0.82),
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 1px 16px rgba(0,0,0,0.45)',
      }}
    >
      <Toolbar
        variant="dense"
        sx={{ minHeight: NAV_HEIGHT, height: NAV_HEIGHT, gap: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
      >
        {/* Logo + wordmark + build tag — owns the corner */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, pl: 0.5 }}>
          <ReticleLogo />
          <Typography
            noWrap
            sx={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: { xs: '0.9rem', sm: '1.05rem' },
              letterSpacing: { xs: '2px', sm: '4px' },
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.94)',
            }}
          >
            CityScope
          </Typography>
        </Box>

        {/* City locator field */}
        <Autocomplete
          size="small"
          disableClearable
          blurOnSelect
          options={cities ?? []}
          value={selectedCity}
          onChange={(_e, value) => {
            if (value) setCity(value);
          }}
          getOptionLabel={(option: City) => option.name}
          renderOption={(props, option: City) => (
            <li {...props} key={option.id}>
              {option.name}, {option.country}
            </li>
          )}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          sx={{
            width: { xs: 'auto', sm: 230 },
            flex: { xs: 1, sm: 'none' },
            minWidth: 0,
            mr: 'auto',
            '& .MuiOutlinedInput-root': {
              color: 'inherit',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '5px',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.09)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.18)' },
              '&.Mui-focused fieldset': { borderColor: `${AMBER}80` },
            },
            '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.4)' },
            '& .MuiInputBase-input': {
              fontFamily: MONO,
              fontSize: '0.78rem',
              letterSpacing: '0.5px',
            },
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Locate city…"
              slotProps={{
                input: {
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <PublicIcon sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 16 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        />

        {/* Live coordinate readout */}
        <LiveReadout />

        {/* Copy shareable link */}
        <ShareButton />

        {/* 2D / 3D segmented instrument toggle */}
        <Box
          role="group"
          aria-label="Map dimension"
          sx={{
            display: 'flex',
            flexShrink: 0,
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.09)',
            overflow: 'hidden',
            fontFamily: DISPLAY,
          }}
        >
          {(['2D', '3D'] as const).map((mode) => {
            const active = mode === '3D' ? is3D : !is3D;
            return (
              <Box
                key={mode}
                component="button"
                onClick={() => {
                  if ((mode === '3D') !== is3D) toggle3D();
                }}
                sx={{
                  cursor: 'pointer',
                  border: 'none',
                  px: 1.5,
                  py: '5px',
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  letterSpacing: '1.5px',
                  color: active ? INK : 'rgba(255,255,255,0.55)',
                  background: active ? AMBER : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    background: active ? AMBER : 'rgba(255,255,255,0.05)',
                    color: active ? INK : 'rgba(255,255,255,0.85)',
                  },
                }}
              >
                {mode}
              </Box>
            );
          })}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export { NAV_HEIGHT };
export default Navbar;
