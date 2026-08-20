import DateTimePopover from './DateTimePopover';

function blankStop() {
  return { type: 'pickup', city: '', state: '', datetime: '' };
}

// New stops always land at the end of the list, after the primary PU/DEL
// fields above this editor and after every stop already added -- so adding
// several in a row builds them out in the order they were entered. Each
// stop is one compact row (not a boxed 4-field grid) so adding a drop is
// quick: type, city, state, date/time, remove, all in a line.
function ExtraStopsEditor({ stops, onChange }) {
  function updateStop(index, field, value) {
    onChange(stops.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function removeStop(index) {
    onChange(stops.filter((_, i) => i !== index));
  }

  function addStop() {
    onChange([...stops, blankStop()]);
  }

  return (
    <div className="mb-4">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">Extra stops</label>
      <div className="space-y-2">
        {stops.map((stop, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
            <div className="w-24">
              <label className="mb-1 block text-[10px] text-text-muted" htmlFor={`extra-stop-type-${index}`}>
                Type
              </label>
              <select
                id={`extra-stop-type-${index}`}
                aria-label={`Stop ${index + 1} type`}
                value={stop.type}
                onChange={(e) => updateStop(index, 'type', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
              >
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
            <div className="min-w-[6rem] flex-1">
              <label className="mb-1 block text-[10px] text-text-muted" htmlFor={`extra-stop-city-${index}`}>
                City
              </label>
              <input
                id={`extra-stop-city-${index}`}
                aria-label={`Stop ${index + 1} city`}
                value={stop.city}
                onChange={(e) => updateStop(index, 'city', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
              />
            </div>
            <div className="w-16">
              <label className="mb-1 block text-[10px] text-text-muted" htmlFor={`extra-stop-state-${index}`}>
                State
              </label>
              <input
                id={`extra-stop-state-${index}`}
                aria-label={`Stop ${index + 1} state`}
                value={stop.state}
                onChange={(e) => updateStop(index, 'state', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
              />
            </div>
            <div className="w-36">
              <DateTimePopover
                id={`extra-stop-datetime-${index}`}
                label="Date/time"
                labelClassName="mb-1 block text-[10px] text-text-muted"
                ariaLabel={`Stop ${index + 1} date/time`}
                value={stop.datetime}
                onChange={(value) => updateStop(index, 'datetime', value)}
              />
            </div>
            <button
              type="button"
              onClick={() => removeStop(index)}
              aria-label={`Remove stop ${index + 1}`}
              className="rounded-md border border-error/40 px-2 py-2 text-xs text-error hover:bg-error-bg"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addStop}
        className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
      >
        + Add a stop
      </button>
    </div>
  );
}

export default ExtraStopsEditor;
