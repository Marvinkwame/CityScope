import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import { useMapStore } from '../store/mapStore';

function Navbar() {
  const is3D = useMapStore((state) => state.is3D);
  const toggle3D = useMapStore((state) => state.toggle3D);

  return (
    <AppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <Toolbar>
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
          CityScope
        </Typography>
        <Button
          color="inherit"
          startIcon={<ThreeDRotationIcon />}
          onClick={toggle3D}
          variant={is3D ? 'outlined' : 'text'}
          sx={{
            borderColor: is3D ? 'primary.main' : 'transparent',
            backgroundColor: is3D ? 'rgba(144, 202, 249, 0.12)' : 'transparent',
          }}
        >
          3D Mode
        </Button>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
