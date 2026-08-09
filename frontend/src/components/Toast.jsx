import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

const ToastContext = createContext(null);
const TOAST_DURATION_MS = 4000;

function ToastViewport({ toasts, onDismiss }) {
  const preset = useMotionPreset();

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role="status"
            {...preset.popIn}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text shadow-[0_8px_30px_rgba(10,11,16,0.18)]"
          >
            <button
              type="button"
              onClick={() => {
                toast.onClick?.();
                onDismiss(toast.id);
              }}
              className="text-left font-medium text-text"
            >
              {toast.message}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(toast.id)}
              className="text-text-muted hover:text-text"
            >
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, { onClick } = {}) => {
      const id = idRef.current++;
      setToasts((prev) => [...prev, { id, message, onClick }]);
      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
