function blankStop() {
  return { type: 'pickup', city: '', state: '', datetime: '' };
}

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
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Extra stops</label>
      {stops.map((stop, index) => (
        <div key={index} className="mb-2 grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-type-${index}`}>
              Type
            </label>
            <select
              id={`extra-stop-type-${index}`}
              aria-label={`Stop ${index + 1} type`}
              value={stop.type}
              onChange={(e) => updateStop(index, 'type', e.target.value)}
              className="rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
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
          <div>
            <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-datetime-${index}`}>
              Date/time
            </label>
            <input
              id={`extra-stop-datetime-${index}`}
              aria-label={`Stop ${index + 1} date/time`}
              type="datetime-local"
              value={stop.datetime}
              onChange={(e) => updateStop(index, 'datetime', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
            />
          </div>
          <button
            type="button"
            onClick={() => removeStop(index)}
            aria-label={`Remove stop ${index + 1}`}
            className="rounded-lg border border-error/40 px-3 py-2 text-xs text-error hover:bg-error-bg"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addStop}
        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
      >
        + Add a stop
      </button>
    </div>
  );
}

export default ExtraStopsEditor;
