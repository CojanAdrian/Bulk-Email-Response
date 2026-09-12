import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierSheet from '../../src/components/CarrierSheet';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

describe('CarrierSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('add mode: requires a company name before saving', () => {
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/company name is required/i);
    expect(carriersApi.createCarrier).not.toHaveBeenCalled();
  });

  test('add mode: creates a carrier with the entered fields and calls onSaved/onClose', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/mc number/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({
        company_name: 'ABC Trucking', mc_number: '123456',
      }));
    });
    expect(onSaved).toHaveBeenCalledWith({ id: 1, company_name: 'ABC Trucking' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('add mode: includes dispatcher email in the saved payload', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/dispatcher email/i), { target: { value: 'dispatch@abctrucking.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ dispatcher_email: 'dispatch@abctrucking.com' }));
    });
  });

  test('add mode: toggling equipment pills includes them in the saved payload', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.click(screen.getByRole('button', { name: 'V' }));
    fireEvent.click(screen.getByRole('button', { name: 'R' }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ equipment_types: ['V', 'R'] }));
    });
  });

  test('add mode: parses a comma-separated operating-states list into a valid state array', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/operating states/i), { target: { value: 'tx, ok, notarealstate' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ operating_states: ['TX', 'OK'] }));
    });
  });

  test('edit mode: prefills fields from the given carrier and calls updateCarrier on save', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking', mc_number: '123456', equipment_types: ['V'], operating_states: ['TX'] };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.updateCarrier.mockResolvedValue({ ...carrier, dispatcher_name: 'Jane Doe' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/company name/i).value).toBe('ABC Trucking');
    fireEvent.change(screen.getByLabelText(/dispatcher name/i), { target: { value: 'Jane Doe' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.updateCarrier).toHaveBeenCalledWith(5, expect.objectContaining({ dispatcher_name: 'Jane Doe' }));
    });
  });

  test('edit mode: loads and lists existing lane history', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([
      { id: 10, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500.00' },
    ]);
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toBeInTheDocument();
    });
  });

  test('edit mode: adding a lane calls createCarrierHistory and appends it to the list', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 11, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^origin city$/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/^origin state$/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/^destination city$/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/^destination state$/i), { target: { value: 'IL' } });
    fireEvent.click(screen.getByRole('button', { name: /^add lane$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(5, expect.objectContaining({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      }));
    });
    expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toBeInTheDocument();
  });

  test('edit mode: a manually-added lane can include gp (gross profit) alongside rate', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 11, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500', gp: '300' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^origin city$/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/^origin state$/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/^destination city$/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/^destination state$/i), { target: { value: 'IL' } });
    fireEvent.change(screen.getByLabelText(/^rate$/i), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText(/gross profit/i), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /^add lane$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(5, expect.objectContaining({ rate: 1500, gp: 300 }));
    });
  });

  test('edit mode: removing a lane calls deleteCarrierHistory and removes it from the list', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([
      { id: 10, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' },
    ]);
    carriersApi.deleteCarrierHistory.mockResolvedValue({ ok: true });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/Dallas, TX.*Chicago, IL/));
    fireEvent.click(screen.getByRole('button', { name: /remove lane/i }));

    await waitFor(() => {
      expect(carriersApi.deleteCarrierHistory).toHaveBeenCalledWith(10);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Dallas, TX.*Chicago, IL/)).not.toBeInTheDocument();
    });
  });

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
