import { useMapStore } from '../store/mapStore';

/**
 * Flies the map to a place. A camera move, not a source or layer change, so
 * components may make it directly, as GeoSearch makes its own. It never
 * passes `essential`, so Mapbox skips the flight under reduced motion.
 */
export function flyToPlace(lng: number, lat: number): void {
  useMapStore.getState().map?.flyTo({ center: [lng, lat], zoom: 16, duration: 800 });
}
