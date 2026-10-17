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

const LOADS = {
  available: [
    { id: 1, load_number: '0091003', status: 'active', origin_city: 'Elgin', origin_state: 'IL', dest_city: 'Farmville', dest_state: 'NC', equipment: 'V', target_pay: '2800.00', early_pu: '2026-10-19T16:00:00', load_type: 'contract' },
  ],
  done: [
    { id: 2, load_number: '0087376', status: 'booked', origin_city: 'Goodyear', origin_state: 'AZ', dest_city: 'Norco', dest_state: 'CA', equipment: 'V', target_pay: '800.00', rate: '750.00', gp: '50.00', done_at: '2026-09-14T10:00:00', carrier_id: 7, carrier_name: 'Khela Trucking Inc' },
  ],
};

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    customersApi.listCustomers.mockResolvedValue(CUSTOMERS);
    customersApi.getCustomerCarriers.mockResolvedValue(CARRIERS);
    customersApi.getCustomerLoads.mockResolvedValue(LOADS);
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

  test('the Loads view shows available and done loads, and done ones link to the carrier', async () => {
    render(<CustomersPage />);
    await screen.findByText('Swift Haul LLC');
    const showSwitch = screen.getByRole('radiogroup', { name: /^show$/i });
    expect(within(showSwitch).getByRole('radio', { name: /loads/i })).toHaveTextContent('2');
    fireEvent.click(within(showSwitch).getByRole('radio', { name: /loads/i }));

    const available = screen.getByRole('region', { name: /available/i });
    expect(within(available).getByText(/Elgin, IL/)).toBeInTheDocument();
    expect(within(available).getByRole('button', { name: /copy load number 0091003/i })).toBeInTheDocument();
    expect(within(available).getByText('$2,800')).toBeInTheDocument();

    const done = screen.getByRole('region', { name: /done/i });
    expect(within(done).getByText('$750')).toBeInTheDocument();
    expect(within(done).getByText('GP $50')).toBeInTheDocument();
    expect(within(done).getByRole('button', { name: /open khela trucking inc's profile/i })).toBeInTheDocument();
    expect(customersApi.getCustomerLoads).toHaveBeenCalledWith({ name: 'ALDI, Inc', range: 'all', equipment: '', loadType: 'all' });
  });
});
