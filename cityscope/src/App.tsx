import Box from '@mui/material/Box';
import Navbar, { NAV_HEIGHT } from './components/Navbar';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import FeaturePanel from './components/FeaturePanel';
import HeatmapSpotlightCard from './components/HeatmapSpotlightCard';
import GeoSearch from './components/GeoSearch';
import { useCityStore } from './store/cityStore';
import { useShareSync } from './hooks/useShareSync';

function App() {
  const selectedCity = useCityStore((state) => state.selectedCity);
  useShareSync();

  return (
    <Box sx={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Navbar />
      <Sidebar />
      {/* Map is always full-screen below the navbar; sidebar overlays it */}
      <Box
        component="main"
        sx={{
          position: 'fixed',
          top: `${NAV_HEIGHT}px`,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <MapView />
        <HeatmapSpotlightCard />
        <GeoSearch key={selectedCity.id} />
      </Box>
      <FeaturePanel />
    </Box>
  );
}

export default App;
