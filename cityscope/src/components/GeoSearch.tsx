import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { useGeocode } from '../hooks/useGeocode';
import type { GeocodingFeature } from '../hooks/useGeocode';
import { useGeoSearchStore } from '../store/geoSearchStore';
import { useMapStore } from '../store/mapStore';
import { useCityStore } from '../store/cityStore'; // used for proximity bias in useGeocode
import { AMBER } from '../theme';

function GeoSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const selectedCity = useCityStore((s) => s.selectedCity);
  const { data: geocodeData, isFetching } = useGeocode(
    debouncedQuery,
    selectedCity.centerLng,
    selectedCity.centerLat,
  );

  // Debounce input → debouncedQuery; clear store when input is empty.
  // setDebouncedQuery always runs inside setTimeout (async) to satisfy the
  // react-hooks/set-state-in-effect lint rule. Empty input uses 0ms so it
  // clears without a visible delay.
  // City change is handled via key={selectedCity.id} in App.tsx,
  // which remounts this component and resets all state naturally.
  useEffect(() => {
    if (inputValue === '') {
      useGeoSearchStore.getState().setResult(null);
    }
    const delay = inputValue === '' ? 0 : 300;
    const id = setTimeout(() => setDebouncedQuery(inputValue), delay);
    return () => clearTimeout(id);
  }, [inputValue]);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: { xs: 'calc(100vw - 24px)', sm: 340 },
        maxWidth: 340,
        zIndex: 10,
      }}
    >
      {/*
       * freeSolo is intentionally NOT used here. MUI suppresses the popup
       * (and therefore noOptionsText) when freeSolo=true and options=[].
       * Instead we control `open` explicitly and ignore the 'reset' reason
       * in onInputChange to prevent MUI from clearing the input on blur.
       */}
      <Autocomplete<GeocodingFeature, false, false, false>
        open={dropdownOpen}
        onClose={() => setDropdownOpen(false)}
        options={geocodeData ?? []}
        inputValue={inputValue}
        onInputChange={(_, newValue, reason) => {
          // 'reset' fires on blur-without-selection — ignore it so typed
          // text stays in the input when the user clicks away.
          if (reason !== 'reset') setInputValue(newValue);
        }}
        onChange={(_, value) => {
          if (!value) return;
          const map = useMapStore.getState().map;
          if (map) {
            map.flyTo({
              center: [value.center[0], value.center[1]],
              zoom: 14,
              duration: 800,
            });
          }
          useGeoSearchStore.getState().setResult({
            lng: value.center[0],
            lat: value.center[1],
            placeName: value.place_name,
          });
          // Shorten display to just the place name (before the first comma)
          setInputValue(value.place_name.split(',')[0].trim());
        }}
        getOptionLabel={(option) => option.place_name}
        filterOptions={(x) => x}
        loading={isFetching}
        noOptionsText={
          inputValue.trim().length >= 2 ? 'No results' : 'Type to search'
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search places..."
            size="small"
            onFocus={() => setDropdownOpen(true)}
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
            sx={{
              '& .MuiOutlinedInput-root': {
                background: 'rgba(10,19,29,0.92)',
                backdropFilter: 'blur(16px)',
                borderRadius: '20px',
                boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
                '& fieldset': {
                  borderColor: 'rgba(255,255,255,0.18)',
                  borderRadius: '20px',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(255,255,255,0.35)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: `${AMBER}80`,
                },
              },
              '& .MuiInputBase-input': {
                color: 'rgba(255,255,255,0.9)',
              },
              '& .MuiSvgIcon-root': {
                color: 'rgba(255,255,255,0.5)',
              },
            }}
          />
        )}
      />
    </Box>
  );
}

export default GeoSearch;
