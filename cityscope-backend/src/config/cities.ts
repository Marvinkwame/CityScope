export interface CityConfig {
  id: string;
  name: string;
  country: string;
  centerLng: number;
  centerLat: number;
  defaultZoom: number;
  /** Map framing. */
  bounds: { south: number; west: number; north: number; east: number };
  /**
   * The box the place download covers: the city outline plus a 2 km margin,
   * joined with `bounds` so the download never shrinks. Wider than `bounds`
   * so that places just across the border still count towards reach.
   */
  fetchBounds: { south: number; west: number; north: number; east: number };
  /** What the everyday-reach analysis covers in this city. */
  reach: {
    /** How much of the city the analysis spans, worded for the interface. */
    coverage: string;
    /** Appended to a district name when matching it to its OSM name (Tokyo's wards). */
    districtNameSuffix?: string;
  };
  nameProperty: string;
}

export const CITY_CONFIGS: CityConfig[] = [
  {
    id: 'berlin',
    name: 'Berlin',
    country: 'Germany',
    centerLng: 13.405,
    centerLat: 52.52,
    defaultZoom: 12,
    bounds: { south: 52.34, west: 13.08, north: 52.68, east: 13.76 },
    fetchBounds: { south: 52.32, west: 13.058, north: 52.693, east: 13.791 },
    reach: { coverage: 'whole city' },
    nameProperty: 'name',
  },
  {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    centerLng: -0.1276,
    centerLat: 51.5074,
    defaultZoom: 11,
    bounds: { south: 51.28, west: -0.51, north: 51.69, east: 0.33 },
    fetchBounds: { south: 51.268, west: -0.54, north: 51.71, east: 0.363 },
    reach: { coverage: 'all 33 boroughs' },
    nameProperty: 'name',
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    centerLng: 2.3522,
    centerLat: 48.8566,
    defaultZoom: 13,
    bounds: { south: 48.81, west: 2.22, north: 48.90, east: 2.47 },
    fetchBounds: { south: 48.797, west: 2.196, north: 48.921, east: 2.498 },
    reach: { coverage: 'the 20 arrondissements' },
    nameProperty: 'name',
  },
  {
    id: 'new-york',
    name: 'New York',
    country: 'United States',
    centerLng: -74.006,
    centerLat: 40.7128,
    defaultZoom: 11,
    bounds: { south: 40.49, west: -74.26, north: 40.92, east: -73.70 },
    fetchBounds: { south: 40.478, west: -74.28, north: 40.934, east: -73.676 },
    reach: { coverage: 'the five boroughs' },
    nameProperty: 'name',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    centerLng: 139.6917,
    centerLat: 35.6895,
    defaultZoom: 11,
    bounds: { south: 35.52, west: 139.56, north: 35.82, east: 139.92 },
    fetchBounds: { south: 35.514, west: 139.541, north: 35.836, east: 139.94 },
    reach: { coverage: 'the 23 wards', districtNameSuffix: ' Ku' },
    nameProperty: 'name',
  },
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    country: 'Netherlands',
    centerLng: 4.9041,
    centerLat: 52.3676,
    defaultZoom: 13,
    bounds: { south: 52.31, west: 4.73, north: 52.43, east: 5.08 },
    fetchBounds: { south: 52.26, west: 4.699, north: 52.449, east: 5.138 },
    reach: { coverage: 'whole city' },
    nameProperty: 'name',
  },
  {
    id: 'munich',
    name: 'Munich',
    country: 'Germany',
    centerLng: 11.582,
    centerLat: 48.1351,
    defaultZoom: 12,
    bounds: { south: 48.06, west: 11.36, north: 48.25, east: 11.79 },
    fetchBounds: { south: 48.043, west: 11.333, north: 48.267, east: 11.79 },
    reach: { coverage: 'whole city' },
    nameProperty: 'name',
  },
  {
    id: 'sydney',
    name: 'Sydney',
    country: 'Australia',
    centerLng: 151.2093,
    centerLat: -33.8688,
    defaultZoom: 12,
    bounds: { south: -33.99, west: 151.0, north: -33.69, east: 151.4 },
    fetchBounds: { south: -33.99, west: 151.0, north: -33.69, east: 151.4 },
    reach: { coverage: '33 inner suburbs' },
    nameProperty: 'name',
  },
];
