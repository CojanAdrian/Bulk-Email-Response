import DateTimeField from './DateTimeField';

function blankStop() {
  return { type: 'pickup', city: '', state: '', datetime: '' };
}

// New stops always land at the end of the list, after the primary PU/DEL
// fields above this editor and after every stop already added -- so adding
// several in a row builds them out in the order they were entered.
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
      <div className="space-y-3">
        {stops.map((stop, index) => (
          <div key={index} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Stop {index + 1}</span>
              <button
                type="button"
                onClick={() => removeStop(index)}
                aria-label={`Remove stop ${index + 1}`}
                className="rounded-md border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-type-${index}`}>
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
              <div>
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-city-${index}`}>
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
              <div>
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-state-${index}`}>
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
              <DateTimeField
                id={`extra-stop-datetime-${index}`}
                label="Date/time"
                labelClassName="mb-1 block text-xs text-text-muted"
                ariaLabel={`Stop ${index + 1} date/time`}
                value={stop.datetime}
                onChange={(value) => updateStop(index, 'datetime', value)}
                inputClassName="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
              />
            </div>
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
