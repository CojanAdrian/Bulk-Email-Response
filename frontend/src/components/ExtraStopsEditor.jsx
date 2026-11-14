import DateTimePopover from './DateTimePopover';
import StateSelect from './StateSelect';
import Select from './Select';

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
          <div key={index} className="flex flex-wrap items-end gap-2 rounded-[16px] bg-white/[0.05] p-3">
            <div className="w-24">
              <label className="caps mb-1 block !text-[9.5px]" htmlFor={`extra-stop-type-${index}`}>
                Type
              </label>
              <Select
                id={`extra-stop-type-${index}`}
                ariaLabel={`Stop ${index + 1} type`}
                value={stop.type}
                onChange={(value) => updateStop(index, 'type', value)}
                options={[
                  { value: 'pickup', label: 'Pickup' },
                  { value: 'delivery', label: 'Delivery' },
                ]}
                className="w-full"
              />
            </div>
            <div className="min-w-[6rem] flex-1">
              <label className="caps mb-1 block !text-[9.5px]" htmlFor={`extra-stop-city-${index}`}>
                City
              </label>
              <input
                id={`extra-stop-city-${index}`}
                aria-label={`Stop ${index + 1} city`}
                value={stop.city}
                onChange={(e) => updateStop(index, 'city', e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-[13px] text-text transition-colors"
              />
            </div>
            <div className="w-16">
              <label className="caps mb-1 block !text-[9.5px]" htmlFor={`extra-stop-state-${index}`}>
                State
              </label>
              <StateSelect
                id={`extra-stop-state-${index}`}
                ariaLabel={`Stop ${index + 1} state`}
                value={stop.state}
                onChange={(state) => updateStop(index, 'state', state)}
                className="rounded-xl border px-3 py-2 text-[13px] text-text transition-colors"
              />
            </div>
            <div className="w-36">
              <DateTimePopover
                id={`extra-stop-datetime-${index}`}
                label="Date/time"
                labelClassName="caps mb-1 block !text-[9.5px]"
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
        className="mt-3 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold hover:bg-white/[0.16]"
      >
        + Add a stop
      </button>
    </div>
  );
}

export default ExtraStopsEditor;
