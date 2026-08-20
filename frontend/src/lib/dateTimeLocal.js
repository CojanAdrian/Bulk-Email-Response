// Shared date/time math for the calendar-popover controls (DateTimeCalendar,
// DateTimePopover, DateRangeField). Works entirely off wall-clock text, the
// same way dateInput.js's datetimeLocalToMysql/isoToDatetimeLocal do -- no
// Date object here is ever compared across a timezone boundary.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// Splits a "YYYY-MM-DDTHH:mm" value into its date and time portions.
// Returns nulls for a blank/malformed value.
export function splitDatetimeLocal(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return { datePart: null, timePart: null };
  const [, y, m, d, hh, mm] = match;
  return { datePart: `${y}-${m}-${d}`, timePart: `${hh}:${mm}` };
}

// Recombines a date + time portion back into a "YYYY-MM-DDTHH:mm" value.
// A date picked with no time set yet defaults to 8am -- the same "pick a
// sensible default rather than leave it half-set" idea the old
// DateTimeField's applyQuickTime used for the reverse case (time with no date).
export function combineDatetimeLocal(datePart, timePart) {
  if (!datePart) return '';
  return `${datePart}T${timePart || '08:00'}`;
}

export function todayDatePart() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// Formats a "YYYY-MM-DDTHH:mm" value as a short trigger label, e.g. "Aug 24, 2:00pm".
export function formatShort(value) {
  const { datePart, timePart } = splitDatetimeLocal(value);
  if (!datePart) return null;
  const [, m, d] = datePart.split('-').map(Number);
  const dateLabel = `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
  if (!timePart) return dateLabel;
  const [hh, mm] = timePart.split(':').map(Number);
  const period = hh >= 12 ? 'pm' : 'am';
  const h12 = hh % 12 || 12;
  const timeLabel = mm === 0 ? `${h12}${period}` : `${h12}:${pad2(mm)}${period}`;
  return `${dateLabel}, ${timeLabel}`;
}

// Builds a 6x7 grid of date-part strings ("YYYY-MM-DD") covering the given
// month plus the leading/trailing days needed to fill whole weeks, so the
// calendar always renders as complete rows.
export function buildMonthGrid(viewYear, viewMonth) {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(viewYear, viewMonth, 1 - startWeekday);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    days.push({
      datePart: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      day: d.getDate(),
      inMonth: d.getMonth() === viewMonth,
    });
  }
  return days;
}

export function monthLabel(viewYear, viewMonth) {
  return `${MONTH_NAMES[viewMonth]} ${viewYear}`;
}
