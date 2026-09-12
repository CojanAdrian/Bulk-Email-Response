import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

// A modal variant that slides up from the bottom instead of popping in
// centered (compare Card.jsx + RateModal.jsx's centered pattern) -- for
// content that reads as a "drill into detail" rather than a short,
// focused action. Dismissed via a backdrop click or a close control the
// caller renders inside `children` (no drag-to-dismiss gesture in v1).
// Callers should wrap usage in <AnimatePresence> for the exit animation
// to play on unmount, same convention as RateModal/AddLoadModal today.
function BottomSheet({ onClose, children, className = '' }) {
  const preset = useMotionPreset();
  return (
    <motion.div
      role="presentation"
      onClick={onClose}
      initial={preset.sheet.backdrop.initial}
      animate={preset.sheet.backdrop.animate}
      exit={preset.sheet.backdrop.exit}
      transition={preset.sheet.backdrop.transition}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        initial={preset.sheet.panel.initial}
        animate={preset.sheet.panel.animate}
        exit={preset.sheet.panel.exit}
        transition={preset.sheet.panel.transition}
        // overflow-hidden lives here, on the rounded shell -- overflow-y-auto
        // and padding live on the plain (unrounded) div below instead, so a
        // long body's scrollbar is clipped to the shell's rounded corners
        // rather than rendering as a straight bar poking past them.
        className={`w-full max-w-lg overflow-hidden rounded-t-4xl border border-border bg-surface shadow-[0_12px_40px_rgba(10,11,16,0.18)] ${className}`}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default BottomSheet;
