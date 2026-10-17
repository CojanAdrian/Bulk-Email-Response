import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!invalid) setQuery(value || '');
  }, [value, invalid]);

  const results = US_STATES.filter((code) => stateMatches(code, query));

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
    if (e.key === 'Enter') {
      e.preventDefault();
      resolveOnBlurOrEnter();
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        role="combobox"
        aria-expanded={open}
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
        <ul
          className={`absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg ${
            dark ? 'border-white/10 bg-[#12141c]' : 'border-border bg-surface'
          }`}
        >
          {results.length === 0 && (
            <li className={`px-3 py-2 text-sm ${dark ? 'text-white/50' : 'text-text-muted'}`}>No matching state</li>
          )}
          {results.map((code) => (
            <li key={code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(code)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  dark ? 'text-white hover:bg-white/10' : 'text-text hover:bg-surface-alt'
                }`}
              >
                <span className="font-semibold">{code}</span> — {US_STATE_NAMES[code]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default StateSelect;
