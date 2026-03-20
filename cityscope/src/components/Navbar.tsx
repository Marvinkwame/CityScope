import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';

function Navbar() {
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
          disabled
        >
          3D Mode
        </Button>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
