import { useEffect, useState } from 'react';
import { getStatus, subscribeStatus } from '../lib/liveSocket';

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

function ConnectionIndicator() {
  const [status, setStatus] = useState(getStatus);

  useEffect(() => subscribeStatus(setStatus), []);

  return (
    <span
      role="status"
      aria-label={STATUS_LABELS[status]}
      title={STATUS_LABELS[status]}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
    />
  );
}

export default ConnectionIndicator;
