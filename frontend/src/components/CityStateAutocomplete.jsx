import { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsLibrary, hasGoogleMapsKey } from '../lib/googleMapsLoader';

// Pulls the city name and two-letter state code out of a Google Place
// result. Most US cities are 'locality'; some (mainly New England towns)
// are only 'sublocality' or roll up to the county-equivalent
// 'administrative_area_level_3' -- tried in that order so a real selected
// place always resolves to *something* usable instead of silently failing
// for those.
function extractCityState(place) {
  const components = place.address_components || [];
  const find = (type) => components.find((c) => c.types.includes(type));
  const city = find('locality') || find('sublocality') || find('administrative_area_level_3');
  const state = find('administrative_area_level_1');
  return {
    city: city ? city.long_name : null,
    state: state ? state.short_name : null,
  };
}

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

// A city text input that behaves like Google Maps' own search box: typing
// narrows a dropdown of real place suggestions, and picking one fills in
// both the city and its state -- so "Gary" can resolve to either Gary, IN
// or Gary, SD instead of assuming the wrong one. Falls back to a plain
// text input when no VITE_GOOGLE_MAPS_API_KEY is configured, so the field
// still works, just without suggestions.
//
// Renders its own dropdown (styled to match whatever surrounds it) instead
// of using the google.maps.places.Autocomplete *widget*, which injects an
// unstyled dropdown directly into <body>, outside React's tree -- awkward
// to theme, and prone to click/blur race conditions in React apps. This
// uses the same "prevent blur on mousedown" pattern EquipmentPicker.jsx
// already relies on for its own combobox.
function CityStateAutocomplete({ id, ariaLabel, placeholder, value, onChange, onPlaceSelected, className, dark = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!hasGoogleMapsKey()) return undefined;
    let cancelled = false;
    loadGoogleMapsLibrary('places').then((placesLib) => {
      if (cancelled) return;
      autocompleteServiceRef.current = new placesLib.AutocompleteService();
      placesServiceRef.current = new placesLib.PlacesService(document.createElement('div'));
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
      readyRef.current = true;
    });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(e) {
    onChange(e);
    const query = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!readyRef.current || query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        { input: query, types: ['(cities)'], componentRestrictions: { country: 'us' }, sessionToken: sessionTokenRef.current },
        (predictions, status) => {
          if (status !== 'OK' || !predictions || predictions.length === 0) {
            setSuggestions([]);
            setOpen(false);
            return;
          }
          setSuggestions(predictions);
          setOpen(true);
        }
      );
    }, DEBOUNCE_MS);
  }

  function handleSelect(prediction) {
    setOpen(false);
    setSuggestions([]);
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['address_components'], sessionToken: sessionTokenRef.current },
      (place, status) => {
        if (status !== 'OK' || !place) return;
        const { city, state } = extractCityState(place);
        if (city && state && onPlaceSelected) onPlaceSelected({ city, state });
        // A fresh session token per completed search -- Google bills
        // predictions+details as one session when a token is reused
        // across them, so starting a new one now (not before) keeps the
        // *next* search from being billed as a continuation of this one.
        loadGoogleMapsLibrary('places').then((placesLib) => {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        });
      }
    );
  }

  return (
    // w-full on both the wrapper and the input: a plain <input> as a direct
    // grid/flex child stretches to fill its cell by default, but that
    // stretch applies to the wrapper now that the dropdown needs one --
    // baked in here so callers don't have to compensate for an
    // implementation detail they shouldn't need to know about.
    <div className="relative w-full">
      <input
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        className={`w-full ${className}`}
      />
      {open && suggestions.length > 0 && (
        <ul
          className={`absolute left-0 top-full z-50 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-lg border py-1 ${
            dark ? 'border-white/10 bg-[#12141c] shadow-xl' : 'border-border bg-surface shadow-lg'
          }`}
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.place_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(suggestion)}
                className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm ${
                  dark ? 'text-white hover:bg-white/10' : 'text-text hover:bg-surface-alt'
                }`}
              >
                {suggestion.structured_formatting?.main_text || suggestion.description}
                {suggestion.structured_formatting?.secondary_text && (
                  <span className={`ml-1 ${dark ? 'text-white/50' : 'text-text-muted'}`}>{suggestion.structured_formatting.secondary_text}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CityStateAutocomplete;
