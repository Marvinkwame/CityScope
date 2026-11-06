import { useId } from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CircleIcon from '@mui/icons-material/Circle';
import { AMBER, MONO } from '../theme';

interface LayerSwitchRowProps {
  label: string;
  /** The status dot's colour while the layer is on. */
  colour: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Shows a spinner beside the switch while the layer's data loads. */
  busy?: boolean;
  disabled?: boolean;
  /** A short line under the label, e.g. why the switch is disabled. */
  caption?: string | null;
}

/** One sidebar layer: a status dot, the name, and a switch. */
function LayerSwitchRow({ label, colour, on, onChange, busy = false, disabled = false, caption = null }: LayerSwitchRowProps) {
  const captionId = useId();

  return (
    <ListItem
      disablePadding
      sx={{
        mb: 0.5,
        px: 1,
        py: 0.5,
        borderRadius: '5px',
        background: on ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'all 0.15s ease',
        '&:hover': { background: 'rgba(255,255,255,0.04)' },
      }}
    >
      <ListItemIcon sx={{ minWidth: 26 }}>
        <CircleIcon
          sx={{
            color: on ? colour : 'rgba(255,255,255,0.25)',
            fontSize: 8,
            transition: 'all 0.2s ease',
          }}
        />
      </ListItemIcon>
      <ListItemText
        primary={
          <Typography
            sx={{
              fontFamily: 'inherit',
              fontSize: '0.84rem',
              fontWeight: on ? 500 : 400,
              color: on ? 'rgba(255,255,255,0.90)' : disabled ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.50)',
              transition: 'color 0.15s ease',
            }}
          >
            {label}
          </Typography>
        }
        secondary={
          caption ? (
            <Typography
              id={captionId}
              sx={{ fontFamily: MONO, fontSize: '0.56rem', color: 'rgba(255,255,255,0.40)', mt: 0.25 }}
            >
              {caption}
            </Typography>
          ) : null
        }
      />
      {busy && <CircularProgress size={12} sx={{ color: AMBER, mr: 1 }} />}
      <Switch
        edge="end"
        size="small"
        checked={on}
        disabled={disabled}
        onChange={(_event, checked) => onChange(checked)}
        slotProps={{ input: { 'aria-label': label, 'aria-describedby': caption ? captionId : undefined } }}
      />
    </ListItem>
  );
}

export default LayerSwitchRow;
