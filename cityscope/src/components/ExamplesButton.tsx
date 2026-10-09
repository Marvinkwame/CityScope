import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExploreIcon from '@mui/icons-material/Explore';
import { alpha } from '@mui/material/styles';
import { useUIStore } from '../store/uiStore';
import { ROLE } from '../theme';

/** Re-opens the welcome card, so its examples are never more than a click away. */
function ExamplesButton() {
  const openWelcome = useUIStore((s) => s.openWelcome);
  return (
    <Tooltip title="Examples">
      <IconButton
        onClick={openWelcome}
        size="small"
        aria-label="Show examples"
        sx={{
          color: 'rgba(255,255,255,0.55)',
          flexShrink: 0,
          '&:hover': { color: ROLE.you, background: alpha(ROLE.you, 0.08) },
        }}
      >
        <ExploreIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export default ExamplesButton;
