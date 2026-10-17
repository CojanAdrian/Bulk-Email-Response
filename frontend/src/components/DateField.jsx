import { useEffect, useRef, useState } from 'react';
import PopoverPanel from './PopoverPanel';
import DateTimeCalendar from './DateTimeCalendar';
import { CalendarIcon } from './icons';
import { pad2 } from '../lib/dateTimeLocal';

// "2026-01-15" -> "01/15/2026"
function toDisplay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

// Accepts "01/15/2026", "1/15/2026" or "2026-01-15"; returns "YYYY-MM-DD"
// for a real calendar date, null otherwise.
export function parseDateInput(text) {
  const t = String(text || '').trim();
  let y;
  let m;
  let d;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) [, y, m, d] = match.map(Number);
  else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!match) return null;
    [, m, d, y] = match.map(Number);
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// A date input that you can type into (mm/dd/yyyy) or pick from the app's
// own calendar -- replaces the browser's native date picker, which looked
// different everywhere and ignored the app's theme. Down arrow (or the
// calendar button) opens the calendar; Escape closes it.
function DateField({ value, onChange, ariaLabel, placeholder = 'mm/dd/yyyy', className = '' }) {
  const [text, setText] = useState(toDisplay(value));
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(event) {
      if (!wrapperRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function handleText(next) {
    setText(next);
    if (next.trim() === '') {
      if (value) onChange('');
      return;
    }
    const parsed = parseDateInput(next);
    if (parsed && parsed !== value) onChange(parsed);
  }

  const invalid = text.trim() !== '' && !parseDateInput(text);

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => {
          if (!invalid) setText(toDisplay(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={`w-full rounded-full border py-1.5 pl-3 pr-9 text-sm text-text ${invalid ? '!border-error' : ''}`}
      />
      <button
        type="button"
        aria-label={`Open calendar for ${ariaLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition hover:bg-control hover:text-text"
      >
        <CalendarIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        <PopoverPanel
          ref={panelRef}
          anchorEl={wrapperRef.current}
          role="dialog"
          ariaLabel={ariaLabel}
          className="rounded-2xl border border-border bg-surface p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        >
          <DateTimeCalendar
            mode="date"
            value={value}
            onChange={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="mt-2 w-full rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-control hover:text-text"
            >
              Clear date
            </button>
          )}
        </PopoverPanel>
      )}
    </div>
  );
}

export default DateField;
