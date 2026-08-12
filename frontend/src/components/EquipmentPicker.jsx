import { useEffect, useState } from 'react';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';

function matches(option, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return option.code.toLowerCase().includes(q) || option.label.toLowerCase().includes(q);
}

// A searchable combobox for the equipment field -- typing filters a known
// list of equipment codes (the same vocabulary CSV uploads already
// normalize into, see EQUIPMENT_MAP) instead of free-typing a code that
// might not match anything the rest of the app recognizes.
function EquipmentPicker({ id, value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const results = EQUIPMENT_OPTIONS.filter((option) => matches(option, query));

  function selectOption(option) {
    onChange(option.code);
    setQuery(option.code);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id}
        aria-label="Equipment"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-text-muted">No matching equipment</li>
          )}
          {results.map((option) => (
            <li key={option.code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-alt"
              >
                <span className="font-semibold">{option.code}</span> — {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EquipmentPicker;
