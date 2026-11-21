import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { agreementLine, formatDate, gpCheckLine, upToOneDecimal } from '../../lib/reach/copy';
import { REACH_NEEDS } from '../../lib/reach/model';
import type { ReachMeta } from '../../lib/reach/model';
import { BODY, MONO } from '../../theme';
import SectionLabel from '../results/SectionLabel';

const TEXT_SX = { fontFamily: BODY, fontSize: '0.7rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.66)' } as const;
const FIGURE_SX = { fontFamily: MONO, fontSize: '0.64rem', color: 'rgba(255,255,255,0.88)' } as const;

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <SectionLabel>{title}</SectionLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>{children}</Box>
    </Box>
  );
}

function Text({ children }: { children: ReactNode }) {
  return <Typography sx={TEXT_SX}>{children}</Typography>;
}

/** Where every figure in the panel comes from. Each number here is read from the payload's meta. */
function ReachMethodNote({ meta }: { meta: ReachMeta }) {
  const k = upToOneDecimal(meta.metresPerMinute);
  const { perHundredThousand, checks } = meta.completeness;
  const { londonGpShare, londonGpPractices } = checks;
  const fetched = meta.sources.placesFetchedAt;
  const streetsFetched = meta.sources.streetsFetchedAt;
  const byStreet = meta.method === 'network';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1.5 }}>
      <Part title="Method">
        {byStreet ? (
          <Text>
            Each block&apos;s walk to a need follows streets and footpaths from the block&apos;s centre to the nearest
            place by street, at {k} metres a minute. That pace was fitted against Mapbox walking times on{' '}
            {meta.sampleSize} blocks.
          </Text>
        ) : (
          <Text>
            Each block&apos;s walk to a need is the straight-line distance from the block&apos;s centre to the nearest
            place, divided by {k} straight-line metres a minute. That pace was fitted against Mapbox walking times on{' '}
            {meta.sampleSize} blocks.
          </Text>
        )}
      </Part>

      <Part title="Agreement with Mapbox">
        <Text>
          How often the estimate and Mapbox agree on whether the nearest place is within the limit. Only limits where
          they agree at least 80% of the time are offered.
        </Text>
        <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.25, rowGap: 0.5 }}>
          {meta.stops.map((stop) => (
            <Box key={stop} sx={{ display: 'contents' }}>
              <Box component="dt" sx={{ ...FIGURE_SX, color: 'rgba(255,255,255,0.45)', lineHeight: 1.75 }}>
                {stop} min
              </Box>
              <Box component="dd" sx={{ ...TEXT_SX, m: 0 }}>
                {agreementLine(meta.agreement[stop], checks.calibrationBaseline?.[stop]?.alwaysInsideAgreement)}
              </Box>
            </Box>
          ))}
        </Box>
        <Text>
          Agreement is measured on the held-out half of those blocks, at a pace fitted on the other half, so it
          describes a slightly different fit from the {k} metres a minute the map uses.
        </Text>
        {meta.stops.includes(5) && (
          <Text>
            The 5-minute figure is the informative one: at longer limits most places are within reach anyway.
          </Text>
        )}
      </Part>

      <Part title="Sources">
        <Text>
          Places: {meta.sources.places}
          {fetched ? `, fetched ${formatDate(fetched)}` : ''}.
        </Text>
        {byStreet && streetsFetched && (
          <Text>Streets: © OpenStreetMap contributors, fetched {formatDate(streetsFetched)}.</Text>
        )}
        <Text>Estimated residents: {meta.sources.population}.</Text>
        <Text>Walking pace calibrated {formatDate(meta.sources.calibratedAt)}.</Text>
      </Part>

      <Part title="Places per 100,000 residents">
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', columnGap: 1.25, rowGap: 0.5 }}>
          {REACH_NEEDS.map(({ id, label }) => (
            <Box key={id} sx={{ display: 'contents' }}>
              <Typography sx={TEXT_SX}>{label}</Typography>
              <Typography sx={{ ...FIGURE_SX, lineHeight: 1.75, textAlign: 'right' }}>
                {upToOneDecimal(perHundredThousand[id])}
              </Typography>
            </Box>
          ))}
        </Box>
      </Part>

      {londonGpShare !== undefined && londonGpPractices !== undefined && (
        <Part title="London GP check">
          <Text>{gpCheckLine(londonGpShare, londonGpPractices)}.</Text>
        </Part>
      )}

      <Part title="Limits">
        <Text>Residents are GHSL estimates, not a census.</Text>
        <Text>Buses are not counted.</Text>
        <Text>
          {byStreet
            ? "Distances are measured along streets and paths from each block's centre."
            : "Distances are measured in a straight line from each block's centre."}
        </Text>
      </Part>
    </Box>
  );
}

export default ReachMethodNote;
