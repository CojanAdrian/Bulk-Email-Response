import { describe, test, expect, vi, beforeEach } from 'vitest';
import { chooseOption } from '../helpers/select';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CustomersPage from '../../src/pages/CustomersPage';
import * as customersApi from '../../src/api/customers';

vi.mock('../../src/api/customers');
vi.mock('../../src/api/carriers');

const CUSTOMERS = [
  { name: 'ALDI, Inc', loadCount: 12, contractLoads: 12, spotLoads: 0, loadType: 'contract', carrierCount: 3, lastActivity: '2026-10-10T08:00:00' },
  { name: 'Kroger', loadCount: 4, contractLoads: 0, spotLoads: 4, loadType: 'spot', carrierCount: 1, lastActivity: '2026-09-01T08:00:00' },
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
    expect(customersApi.getCustomerCarriers).toHaveBeenCalledWith({ name: 'ALDI, Inc', range: 'all', equipment: '', loadType: 'all' });
    expect(screen.getByText('3 runs')).toBeInTheDocument();
    expect(screen.getByText('$1,980')).toBeInTheDocument();
    expect(screen.getByText('$240.50')).toBeInTheDocument();
    expect(screen.getByText('Atlanta, GA → Chicago, IL ×2')).toBeInTheDocument();
  });

  test('selecting another customer loads their carriers', async () => {
    render(<CustomersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /kroger/i }));
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'Kroger', range: 'all', equipment: '', loadType: 'all' });
    });
    expect(within(screen.getByRole('list', { name: /customers/i })).getByRole('button', { name: /kroger/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('changing the time range and equipment refetches with those filters', async () => {
    render(<CustomersPage />);
    await screen.findByText('Swift Haul LLC');
    fireEvent.click(screen.getByRole('radio', { name: /30 days/i }));
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'ALDI, Inc', range: '30', equipment: '', loadType: 'all' });
    });
    chooseOption(/equipment/i, 'Reefer R');
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'ALDI, Inc', range: '30', equipment: 'R', loadType: 'all' });
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

  test('the Spot filter keeps only customers who ship spot with us, and narrows the carriers too', async () => {
    render(<CustomersPage />);
    const list = await screen.findByRole('list', { name: /customers/i });
    expect(within(list).getByText('Contract')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /spot/i }));
    expect(within(list).queryByText('ALDI, Inc')).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /kroger/i }));
    await waitFor(() => {
      expect(customersApi.getCustomerCarriers).toHaveBeenLastCalledWith({ name: 'Kroger', range: 'all', equipment: '', loadType: 'spot' });
    });
  });

  test('a customer can be removed after confirming', async () => {
    customersApi.deleteCustomer.mockResolvedValue({ loadsCleared: 12, historyCleared: 3 });
    render(<CustomersPage />);
    await screen.findByText('Swift Haul LLC');
    fireEvent.click(screen.getByRole('button', { name: /remove aldi, inc/i }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/12 loads and carrier runs stay/i);
    fireEvent.click(screen.getByRole('button', { name: /^remove customer$/i }));
    await waitFor(() => expect(customersApi.deleteCustomer).toHaveBeenCalledWith('ALDI, Inc'));
    const list = screen.getByRole('list', { name: /customers/i });
    await waitFor(() => expect(within(list).queryByText('ALDI, Inc')).not.toBeInTheDocument());
    expect(within(list).getByText('Kroger')).toBeInTheDocument();
  });

  test('"Keep it" cancels the removal', async () => {
    render(<CustomersPage />);
    await screen.findByText('Swift Haul LLC');
    fireEvent.click(screen.getByRole('button', { name: /remove aldi, inc/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(customersApi.deleteCustomer).not.toHaveBeenCalled();
  });
});
