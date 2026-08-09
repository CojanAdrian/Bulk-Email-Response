import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import LoadsStatsRow from '../../src/components/LoadsStatsRow';
import * as loadsApi from '../../src/api/loads';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/loads');
vi.mock('../../src/lib/liveSocket');

const LOADS = [
  { id: 1, status: 'active' },
  { id: 2, status: 'active' },
  { id: 3, status: 'booked' },
  { id: 4, status: 'expired' },
];

describe('LoadsStatsRow', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('fetches all loads (no status filter) and shows counts per status', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<LoadsStatsRow refreshKey={0} />);

    expect(loadsApi.listLoads).toHaveBeenCalledWith();
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2); // booked + expired
  });

  test('renders nothing while loading or on error', async () => {
    loadsApi.listLoads.mockRejectedValue(new Error('network error'));
    const { container } = render(<LoadsStatsRow refreshKey={0} />);
    expect(container).toBeEmptyDOMElement();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container).toBeEmptyDOMElement();
  });

  test('refetches when a live load:changed event arrives', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<LoadsStatsRow refreshKey={0} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));

    act(() => {
      liveHandlers['load:changed']({});
    });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(2));
  });
});
