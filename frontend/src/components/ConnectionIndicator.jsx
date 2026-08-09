import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getStatus, subscribeStatus } from '../lib/liveSocket';
import { useMotionPreset } from '../lib/motionConfig';

const STATUS_DOT_CLASSES = {
  open: 'bg-success',
  connecting: 'bg-warning',
  closed: 'bg-shell-text-muted',
};

const STATUS_LABELS = {
  open: 'Live updates: connected',
  connecting: 'Live updates: reconnecting',
  closed: 'Live updates: offline',
};

// A steady dot doesn't communicate "still trying to reconnect" — the pulse
// itself carries that meaning, so it only plays while connecting/reconnecting
// and stops the instant the connection settles (no motion on 'open'/'closed').
function ConnectionIndicator() {
  const preset = useMotionPreset();
  const [status, setStatus] = useState(getStatus);

  useEffect(() => subscribeStatus(setStatus), []);

  const pulsing = status === 'connecting' && !preset.reduced;

  return (
    <motion.span
      role="status"
      aria-label={STATUS_LABELS[status]}
      title={STATUS_LABELS[status]}
      animate={pulsing ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
      transition={pulsing ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
    />
  );
}

export default ConnectionIndicator;
