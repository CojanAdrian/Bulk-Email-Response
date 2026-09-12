import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsPage from '../../src/pages/StatsPage';
import * as loadsApi from '../../src/api/loads';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/loads');
vi.mock('../../src/lib/liveSocket');

const STATS_RESPONSE = {
  loads: [
    {
      id: 1,
      load_number: 'L-100',
      origin_city: 'Miami',
      origin_state: 'FL',
      dest_city: 'Atlanta',
      dest_state: 'GA',
      target_pay: 1500,
      rate: 1400,
      gp: 100,
      driver_name: 'Bob',
      carrier_name: 'Acme Trucking',
      booked_date: '2026-09-10',
    },
    {
      id: 2,
      load_number: 'L-101',
      origin_city: 'Dallas',
      origin_state: 'TX',
      dest_city: 'Denver',
      dest_state: 'CO',
      target_pay: 2000,
      rate: 1700,
      gp: 300,
      driver_name: null,
      carrier_name: null,
      booked_date: '2026-09-11',
    },
  ],
  totals: { count: 2, totalGp: 400, totalRate: 3100, totalTargetPay: 3500 },
};

describe('StatsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    liveSocket.subscribe.mockImplementation(() => () => {});
  });

  test('loads stats for the default range and shows summary totals', async () => {
    loadsApi.getLoadsStats.mockResolvedValue(STATS_RESPONSE);
    render(<StatsPage />);

    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalled());
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('$400')).toBeInTheDocument();
    expect(screen.getByText('$3,100')).toBeInTheDocument();
  });

  test('renders a row per booked load with carrier fallback', async () => {
    loadsApi.getLoadsStats.mockResolvedValue(STATS_RESPONSE);
    render(<StatsPage />);

    expect(await screen.findByText('L-100')).toBeInTheDocument();
    expect(screen.getByText('Acme Trucking')).toBeInTheDocument();
    const row2 = screen.getByText('L-101').closest('tr');
    expect(within(row2).getByText('—')).toBeInTheDocument();
  });

  test('shows an empty state when there are no booked loads in range', async () => {
    loadsApi.getLoadsStats.mockResolvedValue({ loads: [], totals: { count: 0, totalGp: 0, totalRate: 0, totalTargetPay: 0 } });
    render(<StatsPage />);

    expect(await screen.findByText('No booked loads in this period.')).toBeInTheDocument();
  });

  test('shows an error message when the request fails', async () => {
    loadsApi.getLoadsStats.mockRejectedValue(new Error('Request failed'));
    render(<StatsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  });

  test('clicking a preset re-fetches with that preset\'s date range', async () => {
    loadsApi.getLoadsStats.mockResolvedValue(STATS_RESPONSE);
    render(<StatsPage />);
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(2));
    const lastCall = loadsApi.getLoadsStats.mock.calls[1][0];
    expect(lastCall.from).toEqual(lastCall.to);
  });

  test('setting a custom from date re-fetches and deactivates the presets', async () => {
    loadsApi.getLoadsStats.mockResolvedValue(STATS_RESPONSE);
    render(<StatsPage />);
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText('Custom from date'), '2026-01-01');

    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(2));
    const lastCall = loadsApi.getLoadsStats.mock.calls[1][0];
    expect(lastCall.from).toBe('2026-01-01');
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a sortable column header toggles sort key and direction', async () => {
    loadsApi.getLoadsStats.mockResolvedValue(STATS_RESPONSE);
    render(<StatsPage />);
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(1));
    expect(loadsApi.getLoadsStats.mock.calls[0][0]).toMatchObject({ sort: 'ran_at', direction: 'desc' });

    await userEvent.click(screen.getByRole('button', { name: 'GP' }));
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(2));
    expect(loadsApi.getLoadsStats.mock.calls[1][0]).toMatchObject({ sort: 'gp', direction: 'desc' });

    await userEvent.click(screen.getByRole('button', { name: 'GP' }));
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(3));
    expect(loadsApi.getLoadsStats.mock.calls[2][0]).toMatchObject({ sort: 'gp', direction: 'asc' });
  });

  test('refetches when a live load:changed event arrives', async () => {
    let liveHandler;
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandler = handler;
      return () => {};
    });
    loadsApi.getLoadsStats.mockResolvedValue(STATS_RESPONSE);
    render(<StatsPage />);
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(1));

    act(() => {
      liveHandler({});
    });

    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenCalledTimes(2));
  });
});
