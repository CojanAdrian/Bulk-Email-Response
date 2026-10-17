import { useEffect, useId, useRef, useState } from 'react';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import { useListboxNav } from '../lib/useListboxNav';
import ListboxPanel from './ListboxPanel';

function matches(option, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return option.code.toLowerCase().includes(q) || option.label.toLowerCase().includes(q);
}

// A searchable combobox for the equipment field -- typing filters a known
// list of equipment codes (the same vocabulary CSV uploads already
// normalize into, see EQUIPMENT_MAP) instead of free-typing a code that
// might not match anything the rest of the app recognizes. Up/Down and
// Enter pick without the mouse.
function EquipmentPicker({ id, value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const listId = `${useId()}-equipment`;

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const results = EQUIPMENT_OPTIONS.filter((option) => matches(option, query));

  function selectOption(option) {
    if (!option) return;
    onChange(option.code);
    setQuery(option.code);
    setOpen(false);
  }

  const nav = useListboxNav({ count: results.length, open, setOpen, onPick: (index) => selectOption(results[index]) });

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        aria-label="Equipment"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && nav.activeIndex >= 0 ? `${listId}-opt-${nav.activeIndex}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          nav.setActiveIndex(e.target.value.trim() === '' ? -1 : 0);
        }}
        onKeyDown={(e) => nav.handleKeyDown(e)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
      />
      {open && (
        <ListboxPanel
          id={listId}
          anchorEl={inputRef.current}
          ariaLabel="Equipment options"
          options={results.map((option) => ({ value: option.code, label: `${option.code} — ${option.label}` }))}
          activeIndex={nav.activeIndex}
          selectedValue={value}
          onPick={(index) => selectOption(results[index])}
          onHover={nav.setActiveIndex}
          emptyText="No matching equipment"
        />
      )}
    </div>
  );
}

export default EquipmentPicker;
