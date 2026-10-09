import { useCities } from './useCities';
import { useMapStore } from '../store/mapStore';
import { serverStatus, type ServerStatus } from '../lib/serverStatus';

/** The cold-start status, shared by the welcome card and the status pill. */
export function useServerStatus(): { status: ServerStatus; retry: () => void } {
  const { data, isError, refetch } = useCities();
  const mapReady = useMapStore((s) => s.map !== null);
  return {
    status: serverStatus({ hasData: data !== undefined, isError }, mapReady),
    retry: () => {
      void refetch();
    },
  };
}
