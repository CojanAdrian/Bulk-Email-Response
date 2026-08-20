import { useEffect, useRef, useState } from 'react';
import DateTimeCalendar from './DateTimeCalendar';
import { formatShort } from '../lib/dateTimeLocal';

// A single-value date/time control: a button showing the picked value
// (formatted the same short way everywhere), opening a compact popover with
// a real calendar grid and quick time chips -- a drop-in replacement for the
// old native <input type="datetime-local"> wherever only one value is needed
// (e.g. an extra stop's date/time), which is fiddly to read and click
// through and looks different in every browser.
function DateTimePopover({ id, label, ariaLabel, value, onChange, labelClassName }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const display = formatShort(value);

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className={labelClassName || 'mb-1 block text-xs text-text-muted'} htmlFor={id}>
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-sm text-text hover:border-accent-strong"
      >
        {display || 'Set date & time'}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel || label || 'Choose date and time'}
          className="absolute z-20 mt-1 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <DateTimeCalendar value={value} onChange={onChange} idPrefix={id} />
        </div>
      )}
    </div>
  );
}

export default DateTimePopover;
