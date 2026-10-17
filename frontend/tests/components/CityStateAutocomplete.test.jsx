import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const PREDICTION_GARY_SD = {
  place_id: 'place-gary-sd',
  description: 'Gary, SD, USA',
  structured_formatting: { main_text: 'Gary', secondary_text: 'SD, USA' },
};
const PREDICTION_GARY_IN = {
  place_id: 'place-gary-in',
  description: 'Gary, IN, USA',
  structured_formatting: { main_text: 'Gary', secondary_text: 'IN, USA' },
};

let predictionsResponse = { status: 'OK', predictions: [] };
let detailsResponse = { status: 'OK', place: null };

const getPlacePredictionsMock = vi.fn((request, callback) => {
  callback(predictionsResponse.predictions, predictionsResponse.status);
});
const AutocompleteServiceMock = vi.fn(function AutocompleteService() {
  this.getPlacePredictions = getPlacePredictionsMock;
});

const getDetailsMock = vi.fn((request, callback) => {
  callback(detailsResponse.place, detailsResponse.status);
});
const PlacesServiceMock = vi.fn(function PlacesService() {
  this.getDetails = getDetailsMock;
});

const AutocompleteSessionTokenMock = vi.fn(function AutocompleteSessionToken() {});

const loadLibraryMock = vi.fn((name) => {
  if (name === 'places') {
    return Promise.resolve({
      AutocompleteService: AutocompleteServiceMock,
      PlacesService: PlacesServiceMock,
      AutocompleteSessionToken: AutocompleteSessionTokenMock,
    });
  }
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
    predictionsResponse = { status: 'OK', predictions: [] };
    detailsResponse = { status: 'OK', place: null };
    getPlacePredictionsMock.mockClear();
    getDetailsMock.mockClear();
    AutocompleteServiceMock.mockClear();
    PlacesServiceMock.mockClear();
    loadLibraryMock.mockClear();
    ({ default: CityStateAutocomplete } = await import('../../src/components/CityStateAutocomplete'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
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

  test('does not initialize the Places service when no API key is configured', async () => {
    vi.unstubAllEnvs();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadLibraryMock).not.toHaveBeenCalled();
  });

  test('shows a suggestion dropdown of real predictions after typing (debounced)', async () => {
    vi.useFakeTimers();
    predictionsResponse = { status: 'OK', predictions: [PREDICTION_GARY_SD, PREDICTION_GARY_IN] };
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));

    fireEvent.change(screen.getByLabelText('Origin city'), { target: { value: 'Gar' } });
    await vi.advanceTimersByTimeAsync(250);

    expect(getPlacePredictionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'Gar', types: ['(cities)'], componentRestrictions: { country: 'us' } }),
      expect.any(Function)
    );
    expect(screen.getByText('SD, USA')).toBeInTheDocument();
    expect(screen.getByText('IN, USA')).toBeInTheDocument();
  });

  test('does not search for a query shorter than 2 characters', async () => {
    vi.useFakeTimers();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));

    fireEvent.change(screen.getByLabelText('Origin city'), { target: { value: 'G' } });
    await vi.advanceTimersByTimeAsync(250);

    expect(getPlacePredictionsMock).not.toHaveBeenCalled();
  });

  test('clicking a suggestion calls onPlaceSelected with the resolved city and state', async () => {
    vi.useFakeTimers();
    predictionsResponse = { status: 'OK', predictions: [PREDICTION_GARY_SD] };
    detailsResponse = { status: 'OK', place: placeWith([CITY_COMPONENT('Gary'), STATE_COMPONENT('SD', 'South Dakota')]) };
    const onPlaceSelected = vi.fn();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));

    fireEvent.change(screen.getByLabelText('Origin city'), { target: { value: 'Gary' } });
    await vi.advanceTimersByTimeAsync(250);
    fireEvent.click(screen.getByText('SD, USA'));

    expect(getDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 'place-gary-sd' }),
      expect.any(Function)
    );
    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenCalledWith({ city: 'Gary', state: 'SD' }));
  });

  test('a mousedown on a suggestion is prevented so the input\'s blur can\'t close the list before the click lands', async () => {
    vi.useFakeTimers();
    predictionsResponse = { status: 'OK', predictions: [PREDICTION_GARY_SD] };
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));

    fireEvent.change(screen.getByLabelText('Origin city'), { target: { value: 'Gary' } });
    await vi.advanceTimersByTimeAsync(250);

    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(mousedownEvent, 'preventDefault');
    screen.getByText('Gary').closest('[role="option"]').dispatchEvent(mousedownEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  test('does not call onPlaceSelected when the chosen place has no resolvable city/state', async () => {
    vi.useFakeTimers();
    predictionsResponse = { status: 'OK', predictions: [PREDICTION_GARY_SD] };
    detailsResponse = { status: 'OK', place: placeWith([]) };
    const onPlaceSelected = vi.fn();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));

    fireEvent.change(screen.getByLabelText('Origin city'), { target: { value: 'Gary' } });
    await vi.advanceTimersByTimeAsync(250);
    fireEvent.click(screen.getByText('SD, USA'));
    await vi.advanceTimersByTimeAsync(0);

    expect(onPlaceSelected).not.toHaveBeenCalled();
  });

  test('Up/Down move through the suggestions and Enter picks one, no mouse needed', async () => {
    vi.useFakeTimers();
    predictionsResponse = { status: 'OK', predictions: [PREDICTION_GARY_SD, PREDICTION_GARY_IN] };
    detailsResponse = { status: 'OK', place: placeWith([CITY_COMPONENT('Gary'), STATE_COMPONENT('IN', 'Indiana')]) };
    const onPlaceSelected = vi.fn();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));

    const input = screen.getByLabelText('Origin city');
    fireEvent.change(input, { target: { value: 'Gary' } });
    await vi.advanceTimersByTimeAsync(250);

    expect(input).toHaveAttribute('aria-activedescendant', expect.stringMatching(/opt-0$/));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringMatching(/opt-1$/));
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(getDetailsMock).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'place-gary-in' }), expect.any(Function));
    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenCalledWith({ city: 'Gary', state: 'IN' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('Escape closes the suggestions without picking', async () => {
    vi.useFakeTimers();
    predictionsResponse = { status: 'OK', predictions: [PREDICTION_GARY_SD] };
    const onPlaceSelected = vi.fn();
    render(<CityStateAutocomplete id="origin_city" ariaLabel="Origin city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalledWith('places'));
    const input = screen.getByLabelText('Origin city');
    fireEvent.change(input, { target: { value: 'Gary' } });
    await vi.advanceTimersByTimeAsync(250);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onPlaceSelected).not.toHaveBeenCalled();
  });
});

describe('CityStateAutocomplete on the current Places API', () => {
  test('uses AutocompleteSuggestion + Place.fetchFields when available', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fetchFields = vi.fn(async function fetchFields() {
      this.addressComponents = [
        { longText: 'Memphis', shortText: 'Memphis', types: ['locality'] },
        { longText: 'Tennessee', shortText: 'TN', types: ['administrative_area_level_1'] },
      ];
    });
    const fetchAutocompleteSuggestions = vi.fn(async () => ({
      suggestions: [
        {
          placePrediction: {
            placeId: 'memphis',
            mainText: { text: 'Memphis' },
            secondaryText: { text: 'TN, USA' },
            toPlace: () => ({ fetchFields }),
          },
        },
      ],
    }));
    loadLibraryMock.mockImplementation(async () => ({
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
      AutocompleteSessionToken: function Token() {},
    }));
    const { default: Component } = await import('../../src/components/CityStateAutocomplete');
    const onPlaceSelected = vi.fn();
    render(<Component id="dest_city" ariaLabel="Destination city" value="" onChange={vi.fn()} onPlaceSelected={onPlaceSelected} />);
    await vi.waitFor(() => expect(loadLibraryMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Destination city'), { target: { value: 'Memph' } });
    await screen.findByText('TN, USA', {}, { timeout: 2000 });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'Memph', includedPrimaryTypes: ['(cities)'], includedRegionCodes: ['us'] })
    );
    fireEvent.keyDown(screen.getByLabelText('Destination city'), { key: 'Enter' });
    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenCalledWith({ city: 'Memphis', state: 'TN' }));
    vi.unstubAllEnvs();
  });
});
