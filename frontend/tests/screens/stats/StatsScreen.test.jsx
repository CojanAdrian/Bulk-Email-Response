import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import StatsScreen from '../../../src/screens/stats/StatsScreen';
import { getState, resetMapStore } from '../../../src/map/mapStore';
import * as loadsApi from '../../../src/api/loads';
import * as liveSocket from '../../../src/lib/liveSocket';

vi.mock('../../../src/api/loads');
vi.mock('../../../src/lib/liveSocket');

const BOOKED = [
  { id: 1, load_number: 'L1001', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', origin_lat: 41.88, origin_lng: -87.63, dest_lat: 32.78, dest_lng: -96.8, target_pay: '2450.00', rate: '1850.00', gp: '600.00', carrier_name: 'Redline Haul', booked_date: '2026-11-13', booked_at: '2026-11-13T10:00:00' },
  { id: 2, load_number: 'L1002', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Columbus', dest_state: 'OH', target_pay: '1980.00', rate: '1700.00', gp: '2280.00', booked_date: '2026-11-14', booked_at: '2026-11-14T09:00:00' },
];

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <StatsScreen />
      <Where />
    </MemoryRouter>
  );
}

describe('StatsScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMapStore();
    localStorage.clear();
    delete window.matchMedia;
    liveSocket.subscribe.mockReturnValue(() => {});
    loadsApi.getLoadsStats.mockResolvedValue({ loads: BOOKED, totals: { count: 2, totalGp: 2880, totalRate: 3550, totalTargetPay: 4430 } });
  });

  test('lists booked loads with their margin, last week by default', async () => {
    renderScreen();
    expect(await screen.findByText('+$600')).toBeInTheDocument();
    expect(screen.getByText('+$2,280')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 loads booked');
    expect(loadsApi.getLoadsStats).toHaveBeenCalledWith(expect.objectContaining({ sort: 'booked_at', direction: 'desc' }));
  });

  test('a margin under the target per load shows as low', async () => {
    renderScreen();
    expect(await screen.findByText('+$600')).toHaveClass('text-hot');
    expect(screen.getByText('+$2,280')).toHaveClass('text-success');
  });

  test('choosing a range asks for that range', async () => {
    renderScreen();
    await screen.findByText('+$600');
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    await waitFor(() => expect(loadsApi.getLoadsStats).toHaveBeenLastCalledWith(expect.objectContaining({ from: null, to: null })));
  });

  test('draws booked lanes, and hovering one focuses it', async () => {
    renderScreen();
    await screen.findByText('+$600');
    await waitFor(() => expect(getState().lanes.map((lane) => lane.id)).toEqual([1]));
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Open load L1001' }).closest('li'));
    await waitFor(() => expect(getState().focusId).toBe(1));
  });

  test('a booked load opens on the board', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Open load L1002' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/loads/2');
  });

  test('on a wide screen, shows total margin and progress to the weekly target', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    renderScreen();
    expect(await screen.findByText('$2,880')).toBeInTheDocument();
    expect(screen.getByText('10% of your $30,000 weekly target')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gross profit by day' })).toBeInTheDocument();
  });

  test('says so when nothing was booked', async () => {
    loadsApi.getLoadsStats.mockResolvedValue({ loads: [], totals: { count: 0, totalGp: 0, totalRate: 0, totalTargetPay: 0 } });
    renderScreen();
    expect(await screen.findByText('No booked loads in this period.')).toBeInTheDocument();
  });
});
