import { useEffect, useId, useRef, useState } from 'react';
import ListboxPanel from './ListboxPanel';
import { useListboxNav } from '../lib/useListboxNav';
import { US_STATES, US_STATE_NAMES } from '../lib/usStates';

function stateMatches(code, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return code.toLowerCase().startsWith(q) || US_STATE_NAMES[code].toLowerCase().includes(q);
}

// A constrained combobox for a US state field -- same structure as
// EquipmentPicker (typeable input, filtered dropdown, onMouseDown
// preventDefault to dodge the blur race), but for the 50-state-plus-DC
// vocabulary. Unlike a plain text input, it can never leave onChange
// holding a value that isn't a real state: typing "Texs" and blurring
// leaves the field showing "Texs" in an error state instead of silently
// committing a state that will never geocode or match anything downstream.
//
// A typed value that's already an exact 2-letter code match commits on
// every keystroke, not just on blur -- both because that's the natural
// way to type a code you already know, and because several existing
// call sites simulate a single change event with no following blur.
function StateSelect({ id, ariaLabel, value, onChange, className = '', dark = false, placeholder = 'State' }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef(null);
  const listId = `${useId()}-states`;

  useEffect(() => {
    if (!invalid) setQuery(value || '');
  }, [value, invalid]);

  const results = US_STATES.filter((code) => stateMatches(code, query));
  const nav = useListboxNav({
    count: results.length,
    open: open && !invalid,
    setOpen,
    onPick: (index) => commit(results[index]),
  });

  function commit(code) {
    setQuery(code);
    setOpen(false);
    setInvalid(false);
    onChange(code);
  }

  function resolveTyped(text) {
    const trimmed = text.trim();
    if (trimmed === '') return '';
    const upper = trimmed.toUpperCase();
    if (US_STATES.includes(upper)) return upper;
    const byName = US_STATES.find((code) => US_STATE_NAMES[code].toLowerCase() === trimmed.toLowerCase());
    return byName || null;
  }

  function handleChange(e) {
    const raw = e.target.value;
    setQuery(raw);
    setInvalid(false);
    setOpen(true);
    nav.setActiveIndex(raw.trim() === '' ? -1 : 0);
    const upper = raw.trim().toUpperCase();
    if (US_STATES.includes(upper)) {
      onChange(upper);
    }
  }

  function resolveOnBlurOrEnter() {
    const resolved = resolveTyped(query);
    if (resolved === '') {
      setInvalid(false);
      onChange('');
      return;
    }
    if (resolved) {
      commit(resolved);
      return;
    }
    setInvalid(true);
  }

  function handleBlur() {
    setOpen(false);
    resolveOnBlurOrEnter();
  }

  function handleKeyDown(e) {
    // Arrow keys / Enter on a highlighted state / Escape / Tab come first;
    // a plain Enter with nothing highlighted still resolves what was typed.
    if (nav.handleKeyDown(e)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      resolveOnBlurOrEnter();
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        role="combobox"
        aria-expanded={open && !invalid}
        aria-controls={open && !invalid ? listId : undefined}
        aria-activedescendant={open && !invalid && nav.activeIndex >= 0 ? `${listId}-opt-${nav.activeIndex}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full ${className} ${invalid ? 'ring-2 ring-error' : ''}`}
      />
      {invalid && (
        <p role="alert" className="mt-1 text-xs text-error">
          Not a valid US state.
        </p>
      )}
      {open && !invalid && (
        <ListboxPanel
          id={listId}
          anchorEl={inputRef.current}
          ariaLabel={`${ariaLabel || 'State'} options`}
          options={results.map((code) => ({ value: code, label: code, hint: US_STATE_NAMES[code] }))}
          activeIndex={nav.activeIndex}
          selectedValue={value}
          onPick={(index) => commit(results[index])}
          onHover={nav.setActiveIndex}
          emptyText="No matching state"
        />
      )}
    </div>
  );
}

export default StateSelect;
