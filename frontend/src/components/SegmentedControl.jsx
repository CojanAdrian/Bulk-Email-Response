import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

// Apple-style segmented control: a radiogroup whose selected thumb glides
// between options. Arrow keys move the selection (roving tabindex), so it
// works the same with a keyboard as with a mouse.
function SegmentedControl({ options, value, onChange, ariaLabel, size = 'md', className = '', layoutId }) {
  const preset = useMotionPreset();
  const refs = useRef([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const thumbId = layoutId || `seg-${ariaLabel}`;

  function handleKeyDown(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (selectedIndex + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]';

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`isolate flex min-w-0 max-w-full gap-0.5 overflow-x-auto rounded-xl bg-surface-alt p-1 [scrollbar-width:none] ${className}`}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`relative flex min-h-[36px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors duration-200 sm:min-h-0 ${pad} ${
              selected ? 'text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            {selected && (
              <motion.span
                layoutId={preset.reduced ? undefined : thumbId}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-lg bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.18)] ring-1 ring-border"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {option.icon}
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className={`tabular-nums ${selected ? 'text-text-muted' : 'text-text-muted/80'}`}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
