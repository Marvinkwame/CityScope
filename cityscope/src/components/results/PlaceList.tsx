import { useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useMapStore } from '../../store/mapStore';
import { MONO, ROLE } from '../../theme';
import CategoryIcon from './CategoryIcon';
import SectionLabel from './SectionLabel';
import { categoryLabel, formatCount } from './format';

export interface PlaceItem {
  id: number | string;
  name: string | null;
  category: string;
  lng: number;
  lat: number;
  /** Optional right-hand detail, such as "120 m". */
  meta?: string;
}

// A camera move, not a source or layer change. This is the one map call
// components make directly, and it now lives only here.
function flyTo(place: PlaceItem) {
  useMapStore.getState().map?.flyTo({ center: [place.lng, place.lat], zoom: 16, duration: 800 });
}

/**
 * Places as rows that fly the map to the place. Shows `initialLimit` rows and
 * then a "Show all" toggle. Expanding is something the user does, so the
 * toggle takes the "you" colour.
 */
function PlaceList({
  places,
  initialLimit = 5,
  title,
}: {
  places: ReadonlyArray<PlaceItem>;
  initialLimit?: number;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (places.length === 0) return null;

  const shown = expanded ? places : places.slice(0, initialLimit);
  const canExpand = places.length > initialLimit;

  return (
    <Box>
      {title && <SectionLabel>{title}</SectionLabel>}
      <Box
        component="ul"
        sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: expanded ? 220 : 'none', overflowY: expanded ? 'auto' : 'visible' }}
      >
        {shown.map((p) => {
          const name = p.name ?? 'Unnamed';
          return (
            <Box component="li" key={p.id}>
              <ButtonBase
                disableRipple
                onClick={() => flyTo(p)}
                aria-label={`${name}, ${categoryLabel(p.category)}${p.meta ? `, ${p.meta}` : ''}. Show on map`}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 0.75,
                  py: 0.5,
                  px: 0.5,
                  borderRadius: 0.5,
                  textAlign: 'left',
                  '&:hover': { background: 'rgba(255,255,255,0.04)' },
                  '&.Mui-focusVisible': { outline: `1px solid ${alpha(ROLE.you, 0.6)}` },
                }}
              >
                <CategoryIcon category={p.category} size={13} />
                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.86)' }}>
                  {name}
                  <Box component="span" sx={{ color: 'rgba(255,255,255,0.4)', ml: 0.75 }}>
                    {categoryLabel(p.category)}
                  </Box>
                </Typography>
                {p.meta && (
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                    {p.meta}
                  </Typography>
                )}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
      {canExpand && (
        <ButtonBase
          onClick={() => setExpanded((v) => !v)}
          sx={{ mt: 0.75, px: 0.5, fontSize: '0.72rem', color: ROLE.you, borderRadius: 0.5 }}
        >
          {expanded ? 'Show fewer' : `Show all ${formatCount(places.length)} places`}
        </ButtonBase>
      )}
    </Box>
  );
}

export default PlaceList;
