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
    expect(onPlaceSelected).toHaveBeenCalledWith({ city: 'Gary', state: 'SD' });
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
    screen.getByText('Gary').closest('button').dispatchEvent(mousedownEvent);
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

    expect(onPlaceSelected).not.toHaveBeenCalled();
  });
});
