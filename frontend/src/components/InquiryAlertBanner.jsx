import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

const ALERT_DURATION_MS = 8000;

// A dedicated, harder-to-miss alert for "a new inquiry just came in" --
// separate from the generic small toast queue (see Toast.jsx) because this
// is the one event dispatchers specifically asked to never miss. It's fed
// by the same WebSocket 'inquiry:new' event every open tab/window already
// receives independently (see wsHub.emitToUser, which pushes to every
// connection for the user, not just one) -- so as long as a tab has this
// mounted, opening several tabs/windows already means each one alerts on
// its own, no extra cross-tab plumbing required.
function InquiryAlertViewport({ alerts, onDismiss }) {
  const preset = useMotionPreset();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            role="alert"
            {...preset.banner}
            className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-accent-strong/60 bg-surface shadow-[0_12px_40px_rgba(10,11,16,0.35)]"
          >
            <div className="h-1 w-full animate-banner-glow bg-gradient-to-r from-accent via-accent-strong to-accent" />
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg" aria-hidden="true">
                📩
              </span>
              <button type="button" onClick={() => onDismiss(alert.id, alert.onView)} className="flex-1 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">New inquiry</p>
                <p className="text-sm font-medium text-text">{alert.message}</p>
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss(alert.id)}
                className="shrink-0 text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useInquiryAlerts() {
  const [alerts, setAlerts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id, onView) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    onView?.();
  }, []);

  const pushAlert = useCallback(
    (message, { onView } = {}) => {
      const id = idRef.current++;
      setAlerts((prev) => [...prev, { id, message, onView }]);
      const timer = setTimeout(() => dismiss(id), ALERT_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  const viewport = <InquiryAlertViewport alerts={alerts} onDismiss={dismiss} />;

  return { pushAlert, viewport };
}
