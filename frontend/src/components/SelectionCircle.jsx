import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';
import { CheckIcon } from './icons';

// The leading tap target in selection mode -- an empty ring that fills
// with a checkmark and springs into place when selected (see
// motionConfig.js's `selectionPop` preset), replacing a plain HTML
// checkbox with something that reads as native/iOS rather than a form
// control. Same selected/onToggle/ariaLabel interface a checkbox
// <input>'s checked/onChange/aria-label had, so it drops into existing
// list rows without changing the surrounding selection-state logic.
function SelectionCircle({ selected, onToggle, ariaLabel }) {
  const preset = useMotionPreset();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        selected ? 'border-accent bg-accent' : 'border-border bg-transparent'
      }`}
    >
      {selected && (
        <motion.span
          initial={preset.selectionPop.initial}
          animate={preset.selectionPop.animate}
          transition={preset.selectionPop.transition}
          className="flex items-center justify-center"
        >
          <CheckIcon className="h-3.5 w-3.5 text-accent-ink" />
        </motion.span>
      )}
    </button>
  );
}

export default SelectionCircle;
