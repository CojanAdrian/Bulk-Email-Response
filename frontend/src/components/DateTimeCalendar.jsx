import { useEffect, useRef, useState } from 'react';
import {
  splitDatetimeLocal, combineDatetimeLocal, todayDatePart,
  buildMonthGrid, monthLabel, WEEKDAY_LABELS, pad2,
} from '../lib/dateTimeLocal';
import { ChevronDownIcon } from './icons';

// Common appointment-time presets, as one-click chips -- a click on a
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

function shiftDay(datePart, days) {
  const [y, m, d] = datePart.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

function shiftMonth(datePart, months) {
  const [y, m, d] = datePart.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(Math.min(d, lastDay))}`;
}

// The app's calendar: a month grid (today ringed, the pick in lime) plus,
// in datetime mode, quick time chips and an exact time field. Shared by
// every date control (pickup/delivery windows, extra stops, Stats ranges).
//
// Keyboard: arrows move a day / a week, Home/End jump to the week's ends,
// PageUp/PageDown change month, Enter or Space picks the focused day.
//
// mode="date" hides the time controls and reports a bare "YYYY-MM-DD".
function DateTimeCalendar({ value, onChange, idPrefix, mode = 'datetime' }) {
  const isDateOnly = mode === 'date';
  const { datePart, timePart } = isDateOnly ? { datePart: value || '', timePart: '' } : splitDatetimeLocal(value);
  const today = todayDatePart();
  const [focusedDay, setFocusedDay] = useState(datePart || today);
  const [viewYear, viewMonth] = [Number(focusedDay.slice(0, 4)), Number(focusedDay.slice(5, 7)) - 1];
  const gridRef = useRef(null);
  const moveFocusRef = useRef(false);

  useEffect(() => {
    if (!moveFocusRef.current || !gridRef.current) return;
    moveFocusRef.current = false;
    const el = gridRef.current.querySelector(`[data-day="${focusedDay}"]`);
    if (el) el.focus();
  }, [focusedDay]);

  function emit(dayPart, time) {
    onChange(isDateOnly ? dayPart : combineDatetimeLocal(dayPart, time));
  }

  function selectDay(dayDatePart) {
    setFocusedDay(dayDatePart);
    emit(dayDatePart, timePart);
  }

  function selectTime(timeValue) {
    emit(datePart || today, timeValue);
  }

  function goToMonth(delta) {
    setFocusedDay((prev) => shiftMonth(prev, delta));
  }

  function handleGridKeyDown(event) {
    const moves = {
      ArrowLeft: () => shiftDay(focusedDay, -1),
      ArrowRight: () => shiftDay(focusedDay, 1),
      ArrowUp: () => shiftDay(focusedDay, -7),
      ArrowDown: () => shiftDay(focusedDay, 7),
      PageUp: () => shiftMonth(focusedDay, -1),
      PageDown: () => shiftMonth(focusedDay, 1),
      Home: () => shiftDay(focusedDay, -new Date(`${focusedDay}T00:00`).getDay()),
      End: () => shiftDay(focusedDay, 6 - new Date(`${focusedDay}T00:00`).getDay()),
    };
    if (moves[event.key]) {
      event.preventDefault();
      moveFocusRef.current = true;
      setFocusedDay(moves[event.key]());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDay(focusedDay);
    }
  }

  const days = buildMonthGrid(viewYear, viewMonth);

  return (
    <div className="w-[17.5rem] select-none text-text">
      <div className="mb-3 flex items-center gap-1">
        <span className="flex-1 pl-1 font-display text-[15px] font-bold tracking-tight">{monthLabel(viewYear, viewMonth)}</span>
        <button
          type="button"
          onClick={() => {
            setFocusedDay(today);
            if (!datePart) selectDay(today);
          }}
          className="rounded-full border border-control-border bg-control px-2.5 py-1 text-[11px] font-semibold text-text transition hover:bg-control-hover"
        >
          Today
        </button>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goToMonth(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-control hover:text-text"
        >
          <ChevronDownIcon aria-hidden="true" className="h-4 w-4 rotate-90" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goToMonth(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-control hover:text-text"
        >
          <ChevronDownIcon aria-hidden="true" className="h-4 w-4 -rotate-90" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={`${w}-${i}`} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div ref={gridRef} role="grid" aria-label={monthLabel(viewYear, viewMonth)} onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const selected = d.datePart === datePart;
          const isToday = d.datePart === today;
          return (
            <button
              key={d.datePart}
              type="button"
              data-day={d.datePart}
              aria-label={d.datePart}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              tabIndex={d.datePart === focusedDay ? 0 : -1}
              onClick={() => selectDay(d.datePart)}
              className={`relative flex h-9 items-center justify-center rounded-xl text-[13px] tabular-nums transition-colors duration-100 ${
                selected
                  ? 'bg-accent font-bold text-accent-ink shadow-[0_2px_10px_rgba(215,255,61,0.35)]'
                  : d.inMonth
                    ? 'font-medium text-text hover:bg-control'
                    : 'text-text-muted/50 hover:bg-control'
              } ${isToday && !selected ? 'ring-1 ring-inset ring-focus' : ''}`}
            >
              {d.day}
            </button>
          );
        })}
      </div>
      {!isDateOnly && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Time</p>
          <div className="flex flex-wrap items-center gap-1">
            {QUICK_TIMES.map((qt) => (
              <button
                key={qt.value}
                type="button"
                aria-label={`Set time to ${qt.label}`}
                aria-pressed={timePart === qt.value}
                onClick={() => selectTime(qt.value)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  timePart === qt.value
                    ? 'border-accent-strong bg-accent text-accent-ink'
                    : 'border-control-border bg-control text-text hover:bg-control-hover'
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
              className="ml-auto rounded-full border px-2.5 py-1 text-[12px] font-semibold text-text"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DateTimeCalendar;
