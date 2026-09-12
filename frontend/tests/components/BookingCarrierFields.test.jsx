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

  test('tabbing out of a known MC number autofills the rest of the form', async () => {
    carriersApi.lookupCarrierByMc.mockResolvedValue({
      id: 7, company_name: 'ABC Trucking', dispatcher_name: 'Jane Doe', dispatcher_phone: '555-1234', dispatcher_email: 'dispatch@abc.com',
    });
    render(<BookingCarrierFields loadId={1} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);

    fireEvent.change(screen.getByLabelText(/carrier mc number/i), { target: { value: '123456' } });
    fireEvent.blur(screen.getByLabelText(/carrier mc number/i));

    await waitFor(() => {
      expect(carriersApi.lookupCarrierByMc).toHaveBeenCalledWith('123456');
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/carrier company name/i)).toHaveValue('ABC Trucking');
    });
    expect(screen.getByLabelText(/dispatcher name/i)).toHaveValue('Jane Doe');
    expect(screen.getByLabelText(/dispatcher phone/i)).toHaveValue('555-1234');
    expect(screen.getByLabelText(/dispatcher email/i)).toHaveValue('dispatch@abc.com');
    expect(screen.getByText(/existing carrier found/i)).toBeInTheDocument();
  });

  test('tabbing out of an unknown MC number leaves the form blank for a new carrier', async () => {
    carriersApi.lookupCarrierByMc.mockResolvedValue(null);
    render(<BookingCarrierFields loadId={1} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);

    fireEvent.change(screen.getByLabelText(/carrier mc number/i), { target: { value: '999999' } });
    fireEvent.blur(screen.getByLabelText(/carrier mc number/i));

    await waitFor(() => {
      expect(screen.getByText(/new carrier/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/carrier company name/i)).toHaveValue('');
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
