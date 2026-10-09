import type SvgIcon from '@mui/material/SvgIcon';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import PentagonIcon from '@mui/icons-material/Pentagon';
import type { ShareState } from './shareCodec';

export interface Example {
  id: string;
  title: string;
  /** The city and the kind of analysis. No POI counts: they go stale on a re-seed. */
  kicker: string;
  icon: typeof SvgIcon;
  /** Applied with applyShareState, exactly like a shared link. */
  state: ShareState;
}

/**
 * The welcome card's one-click examples, one per analysis style. The
 * Shoreditch polygon was checked against production data: 244 POIs in
 * 0.61 km², led by restaurants, cafes, bars and pubs.
 */
export const EXAMPLES: ReadonlyArray<Example> = [
  {
    id: 'alexanderplatz-walk',
    title: '15 minutes on foot from Alexanderplatz',
    kicker: 'Berlin · reachability',
    icon: DirectionsWalkIcon,
    state: {
      v: 1,
      city: 'berlin',
      view: { lng: 13.4132, lat: 52.5219, zoom: 13.8, bearing: 0, pitch: 0 },
      layers: { roads: true, buildings: true, districts: false, heatmap: false },
      is3D: false,
      tool: {
        kind: 'isochrone',
        profile: 'walking',
        contourMinutes: [5, 10, 15],
        origin: { lng: 13.4132, lat: 52.5219 },
      },
    },
  },
  {
    id: 'shoreditch-area',
    title: "What's inside Shoreditch?",
    kicker: 'London · drawn-area analysis',
    icon: PentagonIcon,
    state: {
      v: 1,
      city: 'london',
      view: { lng: -0.0785, lat: 51.5247, zoom: 15.2, bearing: 0, pitch: 0 },
      layers: { roads: true, buildings: true, districts: false, heatmap: false },
      is3D: false,
      tool: {
        kind: 'draw',
        polygon: {
          type: 'Polygon',
          coordinates: [[
            [-0.087, 51.5265],
            [-0.0735, 51.5285],
            [-0.07, 51.523],
            [-0.08, 51.5205],
            [-0.087, 51.5265],
          ]],
        },
      },
    },
  },
  {
    id: 'tokyo-density',
    title: 'Where Tokyo is busiest',
    kicker: 'Tokyo · density heatmap',
    icon: BlurOnIcon,
    state: {
      v: 1,
      city: 'tokyo',
      view: { lng: 139.735, lat: 35.685, zoom: 11.3, bearing: 0, pitch: 0 },
      layers: { roads: true, buildings: true, districts: false, heatmap: true },
      is3D: false,
    },
  },
];
