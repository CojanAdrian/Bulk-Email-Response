import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CustomersScreen from '../../../src/screens/customers/CustomersScreen';
import { getState, resetMapStore } from '../../../src/map/mapStore';
import * as customersApi from '../../../src/api/customers';

vi.mock('../../../src/api/customers');

const ALDI = { name: 'ALDI, Inc', loadCount: 14, contractLoads: 10, spotLoads: 4, loadType: 'mixed', carrierCount: 3, lastActivity: '2026-11-12T10:00:00' };
const SAXCO = { name: 'Saxco International', loadCount: 8, contractLoads: 0, spotLoads: 8, loadType: 'spot', carrierCount: 1, lastActivity: '2026-11-01T10:00:00' };
const LOADS = {
  available: [{ id: 1, load_number: 'L1001', status: 'active', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', origin_lat: 41.88, origin_lng: -87.63, dest_lat: 32.78, dest_lng: -96.8, target_pay: '2450.00' }],
  done: [{ id: 2, load_number: 'L0900', status: 'booked', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Columbus', dest_state: 'OH', origin_lat: 33.75, origin_lng: -84.39, dest_lat: 39.96, dest_lng: -83, rate: '1800.00', gp: '350.00', carrier_id: 7, carrier_name: 'Redline Haul', done_at: '2026-11-10T09:00:00' }],
};
const CARRIERS = [{ carrierId: 7, carrierName: 'Redline Haul', mcNumber: '884213', runs: 3, lastRanAt: '2026-11-10', avgRate: 1800, avgGp: 350, lanes: [{ lane: 'Atlanta, GA → Columbus, OH', runs: 3 }] }];

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderScreen(start = '/customers') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <CustomersScreen />
      <Where />
    </MemoryRouter>
  );
}

describe('CustomersScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMapStore();
    localStorage.clear();
    customersApi.listCustomers.mockResolvedValue([ALDI, SAXCO]);
    customersApi.getCustomerLoads.mockResolvedValue(LOADS);
    customersApi.getCustomerCarriers.mockResolvedValue(CARRIERS);
    customersApi.deleteCustomer.mockResolvedValue({ loadsCleared: 14, historyCleared: 3 });
  });

  test('lists customers with loads, carriers and type', async () => {
    renderScreen();
    expect(await screen.findByText('ALDI, Inc')).toBeInTheDocument();
    expect(screen.getByText(/^14 loads · 3 carriers/)).toBeInTheDocument();
    expect(screen.getByText('Both')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 customers');
  });

  test('the Contract filter keeps customers who ship contract loads', async () => {
    renderScreen();
    await screen.findByText('ALDI, Inc');
    fireEvent.click(screen.getByRole('button', { name: /^contract 1$/i }));
    expect(screen.queryByText('Saxco International')).not.toBeInTheDocument();
  });

  test('hovering a customer previews their lanes on the map', async () => {
    renderScreen();
    fireEvent.pointerEnter((await screen.findByRole('button', { name: 'Open ALDI, Inc' })).closest('li'));
    await waitFor(() => expect(customersApi.getCustomerLoads).toHaveBeenCalledWith({ name: 'ALDI, Inc' }));
    await waitFor(() => expect(getState().lanes.map((lane) => lane.id)).toEqual([1, 2]));
  });

  test('opening one shows who hauled for them', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Open ALDI, Inc' }));
    const sheet = await screen.findByRole('dialog', { name: 'ALDI, Inc' });
    expect(screen.getByTestId('path')).toHaveTextContent('/customers/ALDI%2C%20Inc');
    expect(await within(sheet).findByText('Redline Haul')).toBeInTheDocument();
    expect(within(sheet).getByText('3 runs')).toBeInTheDocument();
  });

  test('the Loads view lists open and done loads, and a load opens on the board', async () => {
    renderScreen(`/customers/${encodeURIComponent('ALDI, Inc')}`);
    const sheet = await screen.findByRole('dialog', { name: 'ALDI, Inc' });
    await within(sheet).findByText('Redline Haul');
    fireEvent.click(within(sheet).getByRole('radio', { name: /^loads 2$/i }));
    expect(within(sheet).getByText('Available 1')).toBeInTheDocument();
    expect(within(sheet).getByText('Done 1')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /Chicago, IL/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/loads/1');
  });

  test('changing the range asks again with that range', async () => {
    renderScreen(`/customers/${encodeURIComponent('ALDI, Inc')}`);
    const sheet = await screen.findByRole('dialog', { name: 'ALDI, Inc' });
    await within(sheet).findByText('Redline Haul');
    fireEvent.click(within(sheet).getByRole('radio', { name: '30 days' }));
    await waitFor(() => expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'ALDI, Inc', range: '30', equipment: '', loadType: 'all' }));
  });

  test('Remove asks first, then clears the customer and closes', async () => {
    renderScreen(`/customers/${encodeURIComponent('ALDI, Inc')}`);
    const sheet = await screen.findByRole('dialog', { name: 'ALDI, Inc' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove ALDI, Inc' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove customer' }));
    await waitFor(() => expect(customersApi.deleteCustomer).toHaveBeenCalledWith('ALDI, Inc'));
    await waitFor(() => expect(screen.queryByText('ALDI, Inc')).not.toBeInTheDocument());
  });
});
