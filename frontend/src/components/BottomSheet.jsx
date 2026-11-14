import { motion } from 'framer-motion';
import Portal from './Portal';
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
    <Portal>
      <motion.div
        role="presentation"
        onClick={onClose}
        initial={preset.sheet.backdrop.initial}
        animate={preset.sheet.backdrop.animate}
        exit={preset.sheet.backdrop.exit}
        transition={preset.sheet.backdrop.transition}
        className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 backdrop-blur-md sm:items-center sm:px-4"
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
          className={`mat w-full max-w-lg overflow-hidden rounded-t-[30px] text-text sm:rounded-[34px] ${className}`}
        >
          <div className="max-h-[85vh] overflow-y-auto p-6 [scrollbar-width:none] sm:p-8">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
            {children}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

export default BottomSheet;
