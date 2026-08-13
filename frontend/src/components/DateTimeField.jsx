// Common appointment-time presets, laid out as one-click chips under the
// native datetime-local input -- the native time spinner is fiddly to land
// on an exact minute with, especially on trackpads, so a click on a preset
// beats fighting tiny up/down arrows for the times that come up constantly.
const QUICK_TIMES = [
  { display: '6a', label: '6:00 AM', h: 6, m: 0 },
  { display: '8a', label: '8:00 AM', h: 8, m: 0 },
  { display: '10a', label: '10:00 AM', h: 10, m: 0 },
  { display: '12p', label: '12:00 PM', h: 12, m: 0 },
  { display: '2p', label: '2:00 PM', h: 14, m: 0 },
  { display: '4p', label: '4:00 PM', h: 16, m: 0 },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayDatePart() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// Sets just the time portion of a datetime-local value, keeping whatever
// date is already there (defaulting to today when nothing's been picked
// yet) -- clicking a preset shouldn't clobber a date the user already set.
function applyQuickTime(value, h, m) {
  const datePart = value && value.includes('T') ? value.split('T')[0] : todayDatePart();
  return `${datePart}T${pad2(h)}:${pad2(m)}`;
}

function DateTimeField({ id, label, ariaLabel, value, onChange, labelClassName, inputClassName }) {
  return (
    <div>
      {label && (
        <label
          className={labelClassName || 'mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted'}
          htmlFor={id}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        aria-label={ariaLabel}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName || 'w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text'}
      />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {QUICK_TIMES.map((qt) => (
          <button
            key={qt.display}
            type="button"
            aria-label={`Set time to ${qt.label}`}
            onClick={() => onChange(applyQuickTime(value, qt.h, qt.m))}
            className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:border-accent-strong hover:text-text"
          >
            {qt.display}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DateTimeField;
