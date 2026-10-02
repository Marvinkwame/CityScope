import { useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import { useIsochroneStore } from '../store/isochroneStore';
import { useIsochrone } from '../hooks/useIsochrone';
import { useIsochronePois } from '../hooks/useIsochronePois';
import { MONO, ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import PlaceList from './results/PlaceList';
import StatRow from './results/StatRow';
import { formatCount } from './results/format';

const PROFILE_LABEL: Record<string, string> = {
  walking: 'walking',
  cycling: 'cycling',
  driving: 'driving',
};

function IsochroneResultsPanel() {
  const enabled = useIsochroneStore((s) => s.enabled);
  const origin = useIsochroneStore((s) => s.origin);
  const profile = useIsochroneStore((s) => s.profile);
  const loading = useIsochroneStore((s) => s.loading);

  const { data: isochroneData } = useIsochrone();
  const { data: bands, isLoading: bandsLoading, isError: bandsError } = useIsochronePois(isochroneData);

  // The band the user picked, if any. Until they pick one, the outermost band
  // is shown: the time they actually asked about.
  const [pickedContour, setPickedContour] = useState<number | null>(null);

  // The tool is live but the Mapbox stage has not resolved yet, so stay hidden.
  if (!enabled || origin === null || loading) return null;

  // Second async stage. Without this the whole panel would vanish while the
  // join is in flight, which reads as the feature being broken.
  if (bandsLoading) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={18} sx={{ color: ROLE.answer }} />
        </Box>
      </Box>
    );
  }

  if (bandsError) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="caption" sx={{ color: 'error.main' }}>
          Couldn't analyse reachable places.
        </Typography>
      </Box>
    );
  }

  if (!bands || bands.length === 0) return null;

  const band = bands.find((b) => b.contour === pickedContour) ?? bands[bands.length - 1];

  return (
    <Box sx={{ mt: 1.5 }}>
      <Divider sx={{ mb: 1.5 }} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <PlaceIcon aria-hidden sx={{ fontSize: 14, color: ROLE.answer }} />
        <Typography
          variant="caption"
          sx={{ color: ROLE.answer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Reachability by {PROFILE_LABEL[profile]}
        </Typography>
        <IconButton
          size="small"
          onClick={() => useIsochroneStore.getState().reset()}
          sx={{ ml: 'auto', color: 'text.secondary', p: 0.25 }}
          aria-label="Clear isochrone"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Band switcher */}
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={band.contour}
        onChange={(_event, value: number | null) => {
          if (value !== null) setPickedContour(value);
        }}
        aria-label="Travel time"
        sx={{ mb: 1.5 }}
      >
        {bands.map((b) => (
          <ToggleButton
            key={b.contour}
            value={b.contour}
            sx={{ fontFamily: MONO, fontSize: '0.68rem', py: 0.4, textTransform: 'none' }}
          >
            {b.contour} min
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* The selected band */}
      <StatRow
        stats={[
          { label: 'Places', value: formatCount(band.poiCount) },
          { label: 'Categories', value: String(Object.keys(band.categoryCounts).length) },
        ]}
      />
      {band.poiCount === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          No places within {band.contour} min.
        </Typography>
      ) : (
        <>
          <CategoryBars counts={band.categoryCounts} total={band.poiCount} />
          <Box sx={{ mt: 1.5 }}>
            {/* Switching band starts the list collapsed again. */}
            <PlaceList key={band.contour} title="Places" places={band.pois} />
          </Box>
        </>
      )}
    </Box>
  );
}

export default IsochroneResultsPanel;
