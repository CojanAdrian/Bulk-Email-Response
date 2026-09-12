import { useEffect, useRef } from 'react';
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

// A city text input that behaves like Google Maps' own search box: typing
// narrows a dropdown of real place suggestions (via the Places
// Autocomplete widget), and picking one fills in both the city and its
// state -- so "Gary" can resolve to either Gary, IN or Gary, SD instead of
// assuming the wrong one. Falls back to a plain text input when no
// VITE_GOOGLE_MAPS_API_KEY is configured, so the field still works, just
// without suggestions.
function CityStateAutocomplete({ id, ariaLabel, placeholder, value, onChange, onPlaceSelected, className }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!hasGoogleMapsKey() || !inputRef.current) return undefined;
    let cancelled = false;
    let autocomplete = null;
    loadGoogleMapsLibrary('places').then((placesLib) => {
      if (cancelled || !inputRef.current) return;
      autocomplete = new placesLib.Autocomplete(inputRef.current, {
        types: ['(cities)'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const { city, state } = extractCityState(place);
        if (city && state && onPlaceSelected) onPlaceSelected({ city, state });
      });
    });
    return () => {
      cancelled = true;
      if (autocomplete && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      id={id}
      ref={inputRef}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      autoComplete="off"
      className={className}
    />
  );
}

export default CityStateAutocomplete;
