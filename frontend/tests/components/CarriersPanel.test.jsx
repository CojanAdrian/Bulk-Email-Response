import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarriersPanel from '../../src/components/CarriersPanel';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

describe('CarriersPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('renders carriers returned by the API', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking', mc_number: '123456' }]);
    render(<CarriersPanel />);

    await waitFor(() => {
      expect(screen.getByText('ABC Trucking')).toBeInTheDocument();
    });
    expect(screen.getByText(/MC 123456/)).toBeInTheDocument();
  });

  test('shows an empty state when there are no carriers', async () => {
    carriersApi.listCarriers.mockResolvedValue([]);
    render(<CarriersPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no carriers yet/i)).toBeInTheDocument();
    });
  });

  test('opens the add-carrier sheet', async () => {
    carriersApi.listCarriers.mockResolvedValue([]);
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText(/no carriers yet/i));

    fireEvent.click(screen.getByRole('button', { name: /\+ add carrier/i }));
    expect(screen.getByText(/^add a carrier$/i)).toBeInTheDocument();
  });

  test('a newly-created carrier appears in the list without a full refetch', async () => {
    carriersApi.listCarriers.mockResolvedValue([]);
    carriersApi.createCarrier.mockResolvedValue({ id: 9, company_name: 'New Carrier LLC' });
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText(/no carriers yet/i));

    fireEvent.click(screen.getByRole('button', { name: /\+ add carrier/i }));
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Carrier LLC' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText('New Carrier LLC')).toBeInTheDocument();
    });
  });

  test('clicking a carrier row opens the read-only detail sheet', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking' }]);
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.getCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    await waitFor(() => {
      expect(carriersApi.getCarrier).toHaveBeenCalledWith(1);
    });
    expect(screen.queryByLabelText(/company name/i)).not.toBeInTheDocument();
  });

  test('the detail sheet\'s Edit button opens the edit sheet', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking' }]);
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.getCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    await waitFor(() => screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByText(/^edit ABC Trucking$/i)).toBeInTheDocument();
  });

  test('deleting a carrier requires confirmation, then removes it from the list', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking' }]);
    carriersApi.deleteCarrier.mockResolvedValue({ ok: true });
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByRole('button', { name: /delete abc trucking/i }));
    expect(carriersApi.deleteCarrier).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => {
      expect(carriersApi.deleteCarrier).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('ABC Trucking')).not.toBeInTheDocument();
    });
  });

  test('typing in the search box re-fetches with the query, debounced', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    carriersApi.listCarriers.mockResolvedValue([]);
    render(<CarriersPanel />);
    await vi.waitFor(() => expect(carriersApi.listCarriers).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/search carriers/i), { target: { value: 'ABC' } });
    await vi.advanceTimersByTimeAsync(300);

    expect(carriersApi.listCarriers).toHaveBeenCalledWith('ABC');
    vi.useRealTimers();
  });
});
