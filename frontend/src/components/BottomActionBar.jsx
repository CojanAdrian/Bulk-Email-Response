import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

// A translucent, blurred bar that slides up from the bottom of its
// container when there's an active selection -- replaces a plain bordered
// bulk-action `<div>` with something that reads as an iOS action sheet
// rather than a form toolbar. `children` is left screen-specific (the
// actual buttons a given list needs) rather than over-abstracted here.
function BottomActionBar({ count, children }) {
  const preset = useMotionPreset();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={preset.sheet.panel.initial}
          animate={preset.sheet.panel.animate}
          exit={preset.sheet.panel.exit}
          transition={preset.sheet.panel.transition}
          className="mat sticky bottom-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[20px] px-4 py-3 text-sm"
        >
          <span className="font-medium text-text">{count} selected</span>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BottomActionBar;
