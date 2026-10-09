import { useEffect, useRef } from 'react';
import { useMapStore } from '../store/mapStore';
import { useCityStore } from '../store/cityStore';
import { useLayerStore } from '../store/layerStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useDrawStore } from '../store/drawStore';
import { useCities } from './useCities';
import { encodeState, decodeState, SHARE_HASH_PREFIX } from '../lib/shareCodec';
import { collectShareState, applyShareState } from '../lib/shareState';

export function useShareSync(): void {
  const map = useMapStore((s) => s.map);
  const { data: cities } = useCities();
  const hydratedRef = useRef(false);

  // Hydrate once, when both the map and the city list are ready.
  useEffect(() => {
    if (hydratedRef.current || !map || !cities) return;
    hydratedRef.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return;
    const state = decodeState(hash.slice(SHARE_HASH_PREFIX.length));
    if (state) applyShareState(state, map, cities);
  }, [map, cities]);

  // Live-write the hash after hydration.
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const write = () => {
      if (!hydratedRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const encoded = encodeState(collectShareState(map));
        history.replaceState(null, '', `${SHARE_HASH_PREFIX}${encoded}`);
      }, 400);
    };
    const unsubs = [
      useCityStore.subscribe(write),
      useLayerStore.subscribe(write),
      useMapStore.subscribe(write),
      useIsochroneStore.subscribe(write),
      useRouteStore.subscribe(write),
      useDrawStore.subscribe(write),
    ];
    map.on('moveend', write);
    return () => {
      unsubs.forEach((u) => u());
      map.off('moveend', write);
      if (timer) clearTimeout(timer);
    };
  }, [map]);
}
