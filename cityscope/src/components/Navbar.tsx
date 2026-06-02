import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import { useMapStore } from '../store/mapStore';
import { useCityStore } from '../store/cityStore';
import type { City } from '../store/cityStore';
import { useCities } from '../hooks/useCities';

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
        zIndex: (theme) => theme.zIndex.drawer + 1,
        background: 'rgba(5,5,10,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <Toolbar>
        {/* Logo mark + wordmark */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 3 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #00E5FF 0%, #0288D1 100%)',
              boxShadow: '0 0 12px rgba(0,229,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)',
              }}
            />
          </Box>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700, letterSpacing: '0.3px' }}>
            CityScope
          </Typography>
        </Box>

        {/* City switcher */}
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
            width: 280,
            mr: 'auto',
            '& .MuiOutlinedInput-root': {
              color: 'inherit',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '8px',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused fieldset': { borderColor: 'rgba(0,229,255,0.4)' },
            },
            '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search city..."
              slotProps={{
                input: {
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        />

        {/* 3D toggle */}
        <Button
          color="inherit"
          startIcon={<ThreeDRotationIcon />}
          onClick={toggle3D}
          variant={is3D ? 'outlined' : 'text'}
          sx={{
            borderRadius: '8px',
            borderColor: is3D ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.12)',
            backgroundColor: is3D ? 'rgba(0,229,255,0.08)' : 'transparent',
            color: is3D ? '#00E5FF' : 'rgba(255,255,255,0.7)',
            '&:hover': {
              backgroundColor: is3D ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.06)',
              borderColor: is3D ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.2)',
            },
          }}
        >
          3D Mode
        </Button>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
