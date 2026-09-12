import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingCarrierFields from '../../src/components/BookingCarrierFields';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

describe('BookingCarrierFields', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('requires a company name before logging', () => {
    render(<BookingCarrierFields loadId={1} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);
    fireEvent.click(screen.getByRole('button', { name: /log carrier/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/company name is required/i);
    expect(carriersApi.createCarrier).not.toHaveBeenCalled();
  });

  test('finds-or-creates the carrier, then logs a lane-history entry tied to this load', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 7, company_name: 'ABC Trucking' });
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 20 });
    render(<BookingCarrierFields loadId={42} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);

    fireEvent.change(screen.getByLabelText(/carrier company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/^rate paid$/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /log carrier/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'ABC Trucking' }));
    });
    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(7, expect.objectContaining({
        load_id: 42, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: 1500,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText(/carrier logged for this load/i)).toBeInTheDocument();
    });
  });

  test('shows an error and stays editable when the save fails', async () => {
    carriersApi.createCarrier.mockRejectedValue(new Error('Network error'));
    render(<BookingCarrierFields loadId={1} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);

    fireEvent.change(screen.getByLabelText(/carrier company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.click(screen.getByRole('button', { name: /log carrier/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
    });
    expect(screen.getByLabelText(/carrier company name/i)).toBeInTheDocument();
  });
});
