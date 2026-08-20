import { useState } from 'react';
import {
  splitDatetimeLocal, combineDatetimeLocal, todayDatePart,
  buildMonthGrid, monthLabel, WEEKDAY_LABELS,
} from '../lib/dateTimeLocal';

// Common appointment-time presets, as one-click chips -- the exact set the
// old native-input DateTimeField offered, kept here since a click on a
// preset beats fighting a time-of-day spinner for the times that come up
// constantly. An exact <input type="time"> next to them covers everything else.
const QUICK_TIMES = [
  { display: '6a', label: '6:00 AM', value: '06:00' },
  { display: '8a', label: '8:00 AM', value: '08:00' },
  { display: '10a', label: '10:00 AM', value: '10:00' },
  { display: '12p', label: '12:00 PM', value: '12:00' },
  { display: '2p', label: '2:00 PM', value: '14:00' },
  { display: '4p', label: '4:00 PM', value: '16:00' },
];

// The calendar grid + time chips that DateTimePopover and DateRangeField
// both show once opened -- no trigger button or open/close state of its
// own, just "given a value, let the user pick a new one".
function DateTimeCalendar({ value, onChange, idPrefix }) {
  const { datePart, timePart } = splitDatetimeLocal(value);
  const [initialYear, initialMonth] = (datePart || todayDatePart()).split('-').map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth - 1);

  function goToMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function selectDay(dayDatePart) {
    onChange(combineDatetimeLocal(dayDatePart, timePart));
  }

  function selectTime(timeValue) {
    onChange(combineDatetimeLocal(datePart || todayDatePart(), timeValue));
  }

  const days = buildMonthGrid(viewYear, viewMonth);

  return (
    <div className="w-64">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goToMonth(-1)}
          className="rounded-md p-1 text-text-muted hover:bg-surface-alt hover:text-text"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-text">{monthLabel(viewYear, viewMonth)}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goToMonth(1)}
          className="rounded-md p-1 text-text-muted hover:bg-surface-alt hover:text-text"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-text-muted">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={`${w}-${i}`}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const selected = d.datePart === datePart;
          return (
            <button
              key={d.datePart}
              type="button"
              aria-label={d.datePart}
              aria-pressed={selected}
              onClick={() => selectDay(d.datePart)}
              className={`rounded-md py-1 text-xs ${
                selected
                  ? 'bg-accent font-semibold text-accent-ink'
                  : d.inMonth
                    ? 'text-text hover:bg-surface-alt'
                    : 'text-text-muted/40 hover:bg-surface-alt'
              }`}
            >
              {d.day}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {QUICK_TIMES.map((qt) => (
          <button
            key={qt.value}
            type="button"
            aria-label={`Set time to ${qt.label}`}
            aria-pressed={timePart === qt.value}
            onClick={() => selectTime(qt.value)}
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              timePart === qt.value
                ? 'border-accent-strong bg-accent/20 text-text'
                : 'border-border text-text-muted hover:border-accent-strong hover:text-text'
            }`}
          >
            {qt.display}
          </button>
        ))}
        <input
          id={`${idPrefix}-exact-time`}
          aria-label="Exact time"
          type="time"
          value={timePart || ''}
          onChange={(e) => selectTime(e.target.value)}
          className="rounded-md border border-border bg-surface px-1 py-0.5 text-[11px] text-text"
        />
      </div>
    </div>
  );
}

export default DateTimeCalendar;
