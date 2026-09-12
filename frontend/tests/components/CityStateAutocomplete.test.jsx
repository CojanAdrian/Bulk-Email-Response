import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const autocompleteInstances = [];
const AutocompleteMock = vi.fn(function Autocomplete(inputEl, options) {
  const instance = { inputEl, options, listeners: {}, place: null };
  instance.addListener = (event, handler) => {
    instance.listeners[event] = handler;
  };
  instance.getPlace = () => instance.place;
  autocompleteInstances.push(instance);
  return instance;
});

const loadLibraryMock = vi.fn((name) => {
  if (name === 'places') return Promise.resolve({ Autocomplete: AutocompleteMock });
  return Promise.resolve({});
});

vi.mock('../../src/lib/googleMapsLoader', () => ({
  loadGoogleMapsLibrary: (...args) => loadLibraryMock(...args),
  hasGoogleMapsKey: () => Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
}));

function placeWith(components) {
  return { address_components: components };
}

const CITY_COMPONENT = (name) => ({ long_name: name, types: ['locality'] });
const STATE_COMPONENT = (code, longName) => ({ long_name: longName, short_name: code, types: ['administrative_area_level_1'] });

describe('CityStateAutocomplete', () => {
  let CityStateAutocomplete;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    AutocompleteMock.mockClear();
    loadLibraryMock.mockClear();
    autocompleteInstances.length = 0;
    ({ default: CityStateAutocomplete } = await import('../../src/components/CityStateAutocomplete'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('renders as a plain text input with the given value', () => {
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="Dallas" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Origin city')).toHaveValue('Dallas');
  });

  test('typing still calls onChange like a normal input', () => {
    const onChange = vi.fn();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Origin city'), { target: { value: 'Gar' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('does not initialize the Places widget when no API key is configured', async () => {
    vi.unstubAllEnvs();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadLibraryMock).not.toHaveBeenCalled();
  });

  test('selecting a place calls onPlaceSelected with the city and state', async () => {
    const onPlaceSelected = vi.fn();
    render(<CityStateAutocomplete id="dest_city" ariaLabel="Destination city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await waitFor(() => expect(autocompleteInstances).toHaveLength(1));

    autocompleteInstances[0].place = placeWith([CITY_COMPONENT('Gary'), STATE_COMPONENT('SD', 'South Dakota')]);
    autocompleteInstances[0].listeners.place_changed();

    expect(onPlaceSelected).toHaveBeenCalledWith({ city: 'Gary', state: 'SD' });
  });

  test('restricts suggestions to US cities', async () => {
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} />);
    await waitFor(() => expect(autocompleteInstances).toHaveLength(1));
    expect(autocompleteInstances[0].options).toEqual(expect.objectContaining({
      types: ['(cities)'],
      componentRestrictions: { country: 'us' },
    }));
  });

  test('does not call onPlaceSelected when the chosen place has no resolvable city/state', async () => {
    const onPlaceSelected = vi.fn();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await waitFor(() => expect(autocompleteInstances).toHaveLength(1));

    autocompleteInstances[0].place = placeWith([]);
    autocompleteInstances[0].listeners.place_changed();

    expect(onPlaceSelected).not.toHaveBeenCalled();
  });
});
