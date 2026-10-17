import { useEffect, useId, useRef, useState } from 'react';
import { loadGoogleMapsLibrary, hasGoogleMapsKey } from '../lib/googleMapsLoader';
import { createCitySearch } from '../lib/citySearch';
import { useListboxNav } from '../lib/useListboxNav';
import ListboxPanel from './ListboxPanel';

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

// A city text input that behaves like Google Maps' own search box: typing
// narrows a dropdown of real place suggestions, and picking one fills in
// both the city and its state -- so "Gary" can resolve to Gary, IN or
// Gary, SD instead of assuming. Up/Down move through the suggestions and
// Enter (or Tab) picks one, so the mouse is never needed.
//
// Falls back to a plain text input when no VITE_GOOGLE_MAPS_API_KEY is
// configured (or Google can't be reached) -- the field still works, just
// without suggestions.
function CityStateAutocomplete({ id, ariaLabel, placeholder, value, onChange, onPlaceSelected, className, dark = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const requestRef = useRef(0);
  const listId = `${useId()}-cities`;

  useEffect(() => {
    if (!hasGoogleMapsKey()) return undefined;
    let cancelled = false;
    loadGoogleMapsLibrary('places')
      .then((placesLib) => {
        if (!cancelled) searchRef.current = createCitySearch(placesLib);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function pick(index) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    setOpen(false);
    setSuggestions([]);
    Promise.resolve(suggestion.resolve())
      .then((result) => {
        if (result && result.city && result.state && onPlaceSelected) onPlaceSelected(result);
      })
      .catch(() => {});
  }

  const nav = useListboxNav({ count: suggestions.length, open: open && suggestions.length > 0, setOpen, onPick: pick });

  function handleChange(e) {
    onChange(e);
    const query = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchRef.current || query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestRef.current;
      Promise.resolve(searchRef.current(query))
        .then((results) => {
          // Ignore a slow response to an older query.
          if (requestId !== requestRef.current) return;
          setSuggestions(results);
          setOpen(results.length > 0);
          nav.setActiveIndex(results.length > 0 ? 0 : -1);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        });
    }, DEBOUNCE_MS);
  }

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => nav.handleKeyDown(e)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && nav.activeIndex >= 0 ? `${listId}-opt-${nav.activeIndex}` : undefined}
        autoComplete="off"
        data-dark={dark ? 'true' : undefined}
        className={`w-full ${className}`}
      />
      {showList && (
        <ListboxPanel
          id={listId}
          anchorEl={inputRef.current}
          ariaLabel={`${ariaLabel || 'City'} suggestions`}
          options={suggestions.map((s) => ({ value: s.id, label: s.main, hint: s.secondary }))}
          activeIndex={nav.activeIndex}
          onPick={pick}
          onHover={nav.setActiveIndex}
        />
      )}
    </div>
  );
}

export default CityStateAutocomplete;
