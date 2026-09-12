import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierDetailSheet from '../../src/components/CarrierDetailSheet';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

const CARRIER = {
  id: 5,
  company_name: 'ABC Trucking',
  mc_number: '123456',
  dispatcher_name: 'Jane Doe',
  dispatcher_phone: '555-1234',
  dispatcher_email: 'dispatch@abc.com',
  equipment_types: ['V'],
  equipment_notes: null,
  operating_states: ['TX', 'OK'],
  operating_notes: null,
  comment: 'Reliable carrier',
};

const HISTORY = [
  { id: 1, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: 1500, ran_at: '2026-01-05', driver_name: 'Bob', driver_phone: '555-9999', comment: null },
];

describe('CarrierDetailSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('fetches and displays the full carrier record and lane history read-only', async () => {
    carriersApi.getCarrier.mockResolvedValue(CARRIER);
    carriersApi.listCarrierHistory.mockResolvedValue(HISTORY);

    render(<CarrierDetailSheet carrierId={5} onClose={vi.fn()} onEdit={vi.fn()} />);

    await waitFor(() => screen.getByText('ABC Trucking'));
    expect(screen.getByText('MC 123456')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /555-1234/ })).toHaveAttribute('href', 'tel:5551234');
    expect(screen.getByRole('link', { name: /dispatch@abc.com/ })).toHaveAttribute('href', 'mailto:dispatch@abc.com');
    expect(screen.getByText('Reliable carrier')).toBeInTheDocument();
    expect(screen.getByText(/Dallas, TX → Chicago, IL/)).toBeInTheDocument();
    expect(screen.getByText('$1,500')).toBeInTheDocument();

    expect(screen.queryByLabelText(/company name/i)).not.toBeInTheDocument();
  });

  test('clicking Edit calls onEdit with the loaded carrier', async () => {
    carriersApi.getCarrier.mockResolvedValue(CARRIER);
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    const onEdit = vi.fn();

    render(<CarrierDetailSheet carrierId={5} onClose={vi.fn()} onEdit={onEdit} />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(onEdit).toHaveBeenCalledWith(CARRIER);
  });

  test('shows an empty state when the carrier has no lane history yet', async () => {
    carriersApi.getCarrier.mockResolvedValue(CARRIER);
    carriersApi.listCarrierHistory.mockResolvedValue([]);

    render(<CarrierDetailSheet carrierId={5} onClose={vi.fn()} onEdit={vi.fn()} />);
    await waitFor(() => screen.getByText('ABC Trucking'));
    expect(screen.getByText(/no lanes logged yet/i)).toBeInTheDocument();
  });
});
