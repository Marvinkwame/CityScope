export interface CityConfig {
  id: string;
  name: string;
  country: string;
  centerLng: number;
  centerLat: number;
  defaultZoom: number;
  bounds: { south: number; west: number; north: number; east: number };
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
    nameProperty: 'name',
  },
];
