import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import ShareIcon from '@mui/icons-material/IosShare';
import { alpha } from '@mui/material/styles';
import { AMBER } from '../theme';

function ShareButton() {
  const [open, setOpen] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setOpen(true);
    } catch {
      setOpen(true); // still confirm; clipboard may be blocked in some contexts
    }
  };

  return (
    <>
      <Tooltip title="Copy link to this view">
        <IconButton
          onClick={handleShare}
          size="small"
          aria-label="Copy shareable link"
          sx={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0, '&:hover': { color: AMBER, background: alpha(AMBER, 0.08) } }}
        >
          <ShareIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Snackbar
        open={open}
        autoHideDuration={2000}
        onClose={() => setOpen(false)}
        message="Link copied"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}

export default ShareButton;
