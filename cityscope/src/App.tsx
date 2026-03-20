import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import FeaturePanel from './components/FeaturePanel';

function App() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Navbar />
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Toolbar />
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <MapView />
        </Box>
      </Box>
      <FeaturePanel />
    </Box>
  );
}

export default App;
