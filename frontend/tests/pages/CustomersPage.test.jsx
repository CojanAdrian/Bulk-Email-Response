import { describe, test, expect, vi, beforeEach } from 'vitest';
import { chooseOption } from '../helpers/select';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CustomersPage from '../../src/pages/CustomersPage';
import * as customersApi from '../../src/api/customers';

vi.mock('../../src/api/customers');
vi.mock('../../src/api/carriers');

const CUSTOMERS = [
  { name: 'ALDI, Inc', loadCount: 12, carrierCount: 3, lastActivity: '2026-10-10T08:00:00' },
  { name: 'Kroger', loadCount: 4, carrierCount: 1, lastActivity: '2026-09-01T08:00:00' },
];

const CARRIERS = [
  {
    carrierId: 7, carrierName: 'Swift Haul LLC', mcNumber: '123456', runs: 3, lastRanAt: '2026-10-01', avgRate: 1980, avgGp: 240.5,
    lanes: [{ lane: 'Atlanta, GA → Chicago, IL', runs: 2 }, { lane: 'Dallas, TX → Denver, CO', runs: 1 }],
  },
];

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    customersApi.listCustomers.mockResolvedValue(CUSTOMERS);
    customersApi.getCustomerCarriers.mockResolvedValue(CARRIERS);
  });

  test('lists customers and shows the most recent one with its carriers', async () => {
    render(<CustomersPage />);
    const list = await screen.findByRole('list', { name: /customers/i });
    expect(within(list).getByText('ALDI, Inc')).toBeInTheDocument();
    expect(within(list).getByText('Kroger')).toBeInTheDocument();

    expect(await screen.findByText('Swift Haul LLC')).toBeInTheDocument();
    expect(customersApi.getCustomerCarriers).toHaveBeenCalledWith({ name: 'ALDI, Inc', range: 'all', equipment: '' });
    expect(screen.getByText('3 runs')).toBeInTheDocument();
    expect(screen.getByText('$1,980')).toBeInTheDocument();
    expect(screen.getByText('$240.50')).toBeInTheDocument();
    expect(screen.getByText('Atlanta, GA → Chicago, IL ×2')).toBeInTheDocument();
  });

  test('selecting another customer loads their carriers', async () => {
    render(<CustomersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /kroger/i }));
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'Kroger', range: 'all', equipment: '' });
    });
    expect(screen.getByRole('button', { name: /kroger/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('changing the time range and equipment refetches with those filters', async () => {
    render(<CustomersPage />);
    await screen.findByText('Swift Haul LLC');
    fireEvent.click(screen.getByRole('radio', { name: /30 days/i }));
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'ALDI, Inc', range: '30', equipment: '' });
    });
    chooseOption(/equipment/i, 'Reefer R');
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'ALDI, Inc', range: '30', equipment: 'R' });
    });
  });

  test('search narrows the customer list', async () => {
    render(<CustomersPage />);
    await screen.findByRole('list', { name: /customers/i });
    fireEvent.change(screen.getByRole('searchbox', { name: /search customers/i }), { target: { value: 'kro' } });
    const list = screen.getByRole('list', { name: /customers/i });
    expect(within(list).queryByText('ALDI, Inc')).not.toBeInTheDocument();
    expect(within(list).getByText('Kroger')).toBeInTheDocument();
  });

  test('explains where customers come from when there are none', async () => {
    customersApi.listCustomers.mockResolvedValue([]);
    render(<CustomersPage />);
    expect(await screen.findByText(/no customers yet/i)).toBeInTheDocument();
    expect(customersApi.getCustomerCarriers).not.toHaveBeenCalled();
  });

  test('shows an empty state when the customer has no carrier runs', async () => {
    customersApi.getCustomerCarriers.mockResolvedValue([]);
    render(<CustomersPage />);
    expect(await screen.findByText(/no carrier runs in this view/i)).toBeInTheDocument();
  });
});
