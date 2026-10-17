import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierSheet from '../../src/components/CarrierSheet';
import * as carriersApi from '../../src/api/carriers';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/carriers');
vi.mock('../../src/api/loads');

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

  test("a listed lane's text has an explicit color class (regression: it rendered invisible)", async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([
      { id: 10, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500.00' },
    ]);
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/Dallas, TX.*Chicago, IL/));
    expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toHaveClass('text-text');
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

  test('edit mode: entering a load number that exists autofills the lane draft', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue({
      id: 99, load_number: 'L4521', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', target_pay: 1800, early_pu: '2026-08-10T08:00:00.000Z',
    });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'L4521' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));

    await waitFor(() => {
      expect(screen.getByText(/load found/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^origin city$/i)).toHaveValue('Dallas');
    expect(screen.getByLabelText(/^origin state$/i)).toHaveValue('TX');
    expect(screen.getByLabelText(/^destination city$/i)).toHaveValue('Chicago');
    expect(screen.getByLabelText(/^destination state$/i)).toHaveValue('IL');
    expect(screen.getByLabelText(/^rate$/i)).toHaveValue('1800');
  });

  test('edit mode: an unrecognized load number shows "new" instead of autofilling', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue(null);
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'NOPE' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));

    await waitFor(() => {
      expect(screen.getByText(/no load with that number/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^origin city$/i)).toHaveValue('');
  });

  test('edit mode: autofill never overwrites a field the user already typed', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue({
      id: 99, load_number: 'L4521', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', target_pay: 1800, early_pu: null,
    });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^rate$/i), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'L4521' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));

    await waitFor(() => screen.getByText(/load found/i));
    expect(screen.getByLabelText(/^rate$/i)).toHaveValue('2000');
  });

  test("edit mode: a found load's id is sent as load_id when the lane is saved", async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue({
      id: 99, load_number: 'L4521', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', target_pay: 1800, early_pu: null,
    });
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 11, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'L4521' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));
    await waitFor(() => screen.getByText(/load found/i));
    fireEvent.click(screen.getByRole('button', { name: /^add lane$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(5, expect.objectContaining({ load_id: 99 }));
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

  test('editing a field then clicking Cancel asks to discard before closing', async () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Carrier LLC' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('editing a field then clicking the backdrop asks to discard before closing', async () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Carrier LLC' } });
    fireEvent.click(screen.getByRole('presentation'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('an in-progress, unsaved lane draft also triggers the discard prompt on Cancel', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    const onClose = vi.fn();
    render(<CarrierSheet carrier={carrier} onClose={onClose} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^origin city$/i), { target: { value: 'Dallas' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^cancel$/i }).at(-1));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('edit mode: a manually-added lane can record the customer it was for', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 1, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^origin city$/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/^origin state$/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/^destination city$/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/^destination state$/i), { target: { value: 'IL' } });
    fireEvent.change(screen.getByLabelText(/^customer$/i), { target: { value: 'ALDI, Inc' } });
    fireEvent.click(screen.getByRole('button', { name: /^add lane$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(5, expect.objectContaining({ customer: 'ALDI, Inc' }));
    });
  });
});
