import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
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
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <Toolbar>
        <Typography variant="h6" noWrap sx={{ mr: 3 }}>
          CityScope
        </Typography>

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
              '& fieldset': {
                borderColor: 'rgba(255,255,255,0.23)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255,255,255,0.5)',
              },
            },
            '& .MuiSvgIcon-root': {
              color: 'rgba(255,255,255,0.7)',
            },
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
                      <SearchIcon sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        />

        <Button
          color="inherit"
          startIcon={<ThreeDRotationIcon />}
          onClick={toggle3D}
          variant={is3D ? 'outlined' : 'text'}
          sx={{
            borderColor: is3D ? 'primary.main' : 'transparent',
            backgroundColor: is3D ? 'rgba(144, 202, 249, 0.12)' : 'transparent',
          }}
        >
          3D Mode
        </Button>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
