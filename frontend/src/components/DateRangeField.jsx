import { useEffect, useRef, useState } from 'react';
import DateTimeCalendar from './DateTimeCalendar';

// One popover for an entire PU or DEL window: shows both the early and late
// pickers together, and the trigger button's label is built with the same
// formatRange function (buildPUSched/buildDELSched from datExport.js) the
// loads table uses to display the window -- so what you see while editing
// is exactly what carriers and the table will show, and a load with a
// single fixed appointment is one click away via "Same as early".
function DateRangeField({ legend, earlyId, lateId, earlyValue, lateValue, onEarlyChange, onLateChange, formatRange }) {
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

  const summary = formatRange(earlyValue, lateValue);

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">{legend}</label>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-sm text-text hover:border-accent-strong"
      >
        {summary || `Set ${legend.toLowerCase()} window`}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${legend} window`}
          className="absolute z-20 mt-1 flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <div role="group" aria-label="Early">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Early</span>
            <DateTimeCalendar value={earlyValue} onChange={onEarlyChange} idPrefix={earlyId} />
          </div>
          <div role="group" aria-label="Late">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Late</span>
              <button
                type="button"
                onClick={() => onLateChange(earlyValue)}
                disabled={!earlyValue}
                className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:border-accent-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                Same as early (appt)
              </button>
            </div>
            <DateTimeCalendar value={lateValue} onChange={onLateChange} idPrefix={lateId} />
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangeField;
