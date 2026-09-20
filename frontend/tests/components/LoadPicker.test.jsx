import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoadPicker from '../../src/components/LoadPicker';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const LOAD_A = { id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' };
const LOAD_B = { id: 2, load_number: 'L2002', origin_city: 'Miami', origin_state: 'FL', dest_city: 'Atlanta', dest_state: 'GA' };

describe('LoadPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("fetches and lists the current user's active loads", async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD_A, LOAD_B]);
    render(<LoadPicker ariaLabel="Search loads" onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/L1001/)).toBeInTheDocument();
      expect(screen.getByText(/L2002/)).toBeInTheDocument();
    });
    expect(loadsApi.listLoads).toHaveBeenCalledWith('active');
  });

  test('filters results by load number, city, or state as the user types', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD_A, LOAD_B]);
    render(<LoadPicker ariaLabel="Search loads" onSelect={vi.fn()} />);
    await waitFor(() => screen.getByText(/L1001/));

    fireEvent.change(screen.getByLabelText('Search loads'), { target: { value: 'miami' } });

    expect(screen.queryByText(/L1001/)).not.toBeInTheDocument();
    expect(screen.getByText(/L2002/)).toBeInTheDocument();
  });

  test('calls onSelect with the chosen load', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD_A]);
    const onSelect = vi.fn();
    render(<LoadPicker ariaLabel="Search loads" onSelect={onSelect} />);
    await waitFor(() => screen.getByText(/L1001/));

    fireEvent.click(screen.getByRole('button', { name: /L1001/ }));

    expect(onSelect).toHaveBeenCalledWith(LOAD_A);
  });

  test('shows an error message when the fetch fails', async () => {
    loadsApi.listLoads.mockRejectedValue(new Error('network error'));
    render(<LoadPicker ariaLabel="Search loads" onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
