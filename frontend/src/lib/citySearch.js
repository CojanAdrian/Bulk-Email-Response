// City search on top of Google Places, behind one small interface:
//   predict(query) -> Promise<[{ id, main, secondary, resolve() -> Promise<{ city, state } | null> }]>
//
// Uses the current Places API ("Places API (New)": AutocompleteSuggestion +
// Place.fetchFields). Google stopped offering the legacy
// AutocompleteService / PlacesService to new projects on March 1, 2025, so
// on a recent API key the legacy calls simply never return anything -- the
// reason city suggestions silently stopped working. The legacy path is
// kept only as a fallback for older projects that haven't enabled the new
// API; if the new API errors once, every later search uses legacy.

function pickComponent(components, type) {
  return components.find((c) => Array.isArray(c.types) && c.types.includes(type));
}

// Most US cities are 'locality'; some (mainly New England towns) are only
// 'sublocality' or roll up to 'administrative_area_level_3'.
export function extractCityState(components, { longKey, shortKey }) {
  const list = Array.isArray(components) ? components : [];
  const city = pickComponent(list, 'locality') || pickComponent(list, 'sublocality') || pickComponent(list, 'administrative_area_level_3');
  const state = pickComponent(list, 'administrative_area_level_1');
  return {
    city: city ? city[longKey] : null,
    state: state ? state[shortKey] : null,
  };
}

function newApiSearch(placesLib) {
  let token = new placesLib.AutocompleteSessionToken();
  return async function predict(query) {
    const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedPrimaryTypes: ['(cities)'],
      includedRegionCodes: ['us'],
      sessionToken: token,
    });
    return (suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((prediction) => ({
        id: prediction.placeId,
        main: prediction.mainText?.text || prediction.text?.text || '',
        secondary: prediction.secondaryText?.text || '',
        resolve: async () => {
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ['addressComponents'] });
          // A completed pick ends the billing session; start a fresh one.
          token = new placesLib.AutocompleteSessionToken();
          return extractCityState(place.addressComponents, { longKey: 'longText', shortKey: 'shortText' });
        },
      }));
  };
}

function legacySearch(placesLib) {
  const autocomplete = new placesLib.AutocompleteService();
  const details = new placesLib.PlacesService(document.createElement('div'));
  let token = new placesLib.AutocompleteSessionToken();
  return function predict(query) {
    return new Promise((resolvePredictions) => {
      autocomplete.getPlacePredictions(
        { input: query, types: ['(cities)'], componentRestrictions: { country: 'us' }, sessionToken: token },
        (predictions, status) => {
          if (status !== 'OK' || !predictions) {
            resolvePredictions([]);
            return;
          }
          resolvePredictions(
            predictions.map((p) => ({
              id: p.place_id,
              main: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || '',
              resolve: () =>
                new Promise((resolvePlace) => {
                  details.getDetails({ placeId: p.place_id, fields: ['address_components'], sessionToken: token }, (place, detailStatus) => {
                    token = new placesLib.AutocompleteSessionToken();
                    if (detailStatus !== 'OK' || !place) {
                      resolvePlace(null);
                      return;
                    }
                    resolvePlace(extractCityState(place.address_components, { longKey: 'long_name', shortKey: 'short_name' }));
                  });
                }),
            }))
          );
        }
      );
    });
  };
}

export function createCitySearch(placesLib) {
  const legacyAvailable = typeof placesLib.AutocompleteService === 'function';
  if (!placesLib.AutocompleteSuggestion) {
    return legacyAvailable ? legacySearch(placesLib) : async () => [];
  }
  const modern = newApiSearch(placesLib);
  let fallback = null;
  return async function predict(query) {
    if (fallback) return fallback(query);
    try {
      return await modern(query);
    } catch (err) {
      if (!legacyAvailable) throw err;
      console.warn('Places API (New) failed; falling back to the legacy Places service.', err);
      fallback = legacySearch(placesLib);
      return fallback(query);
    }
  };
}
