import { useEffect, useState } from 'react';

const TICK_MS = 30000;
const listeners = new Set();
let intervalId = null;

function ensureTicking() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    listeners.forEach((listener) => listener());
  }, TICK_MS);
}

// One shared 30-second ticker for every mounted RelativeTime instance,
// rather than each row running its own timer -- doesn't scale to a busy
// inquiry log. The interval itself only exists while at least one
// instance is mounted.
function subscribeTick(listener) {
  listeners.add(listener);
  ensureTicking();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function formatRelative(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes === 0 ? `${hours}h ago` : `${hours}h ${remainderMinutes}m ago`;
}

function severityClass(minutes) {
  if (minutes < 15) return 'text-text-muted';
  if (minutes < 30) return 'text-text';
  if (minutes < 60) return 'text-warning';
  return 'text-error';
}

// Renders a live-ticking "N ago" for a timestamp, colored by age -- muted
// under 15 minutes, normal text 15-30, amber 30-60, red past an hour. A
// carrier's inquiry sitting unanswered for an hour should look urgent,
// not identical to one that just arrived.
function RelativeTime({ value, className = '' }) {
  const [, forceTick] = useState(0);

  useEffect(() => subscribeTick(() => forceTick((n) => n + 1)), []);

  if (!value) return null;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const elapsedMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(elapsedMs / 60000);

  return (
    <span className={`${severityClass(minutes)} ${className}`} title={new Date(value).toLocaleString()}>
      {formatRelative(elapsedMs)}
    </span>
  );
}

export default RelativeTime;
