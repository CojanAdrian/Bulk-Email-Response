import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TodayCard from '../../src/shell/TodayCard';
import { SettingsProvider, DEFAULT_SETTINGS } from '../../src/shell/SettingsContext';
import * as statsApi from '../../src/api/stats';
import * as settingsApi from '../../src/api/settings';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/stats');
vi.mock('../../src/api/settings');
vi.mock('../../src/lib/liveSocket');

const series = (gps) => gps.map((avgGp, i) => ({ day: `2026-11-0${i + 1}`, booked: avgGp ? 1 : 0, avgGp }));

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/loads']}>
      <SettingsProvider>
        <TodayCard />
      </SettingsProvider>
      <Where />
    </MemoryRouter>
  );
}

describe('TodayCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    liveSocket.subscribe.mockReturnValue(() => {});
    settingsApi.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  });

  test("shows loads booked against the daily goal, today's margin and reply time", async () => {
    statsApi.getToday.mockResolvedValue({ today: '2026-11-07', bookedToday: 5, avgGpToday: 1600, gpToday: 6400, gpLoggedToday: 4, series: series([1200, null, 1800, 1500, null, 1600, 2000]), repliedToday: 9, medianReplyMinutes: 4, repliesByHour: [] });
    renderCard();
    expect(await screen.findByRole('img', { name: '5 of 8 loads booked today' })).toBeInTheDocument();
    expect(screen.getByText('3 more')).toBeInTheDocument();
    expect(screen.getByText('$6,400')).toBeInTheDocument();
    expect(screen.getByText(/From 5 booked loads · 1 without a margin/)).toBeInTheDocument();
    expect(screen.queryByText(/avg margin/i)).not.toBeInTheDocument();
    expect(screen.getByText('4 min')).toBeInTheDocument();
    expect(screen.getByText('9 replied today')).toBeInTheDocument();
  });

  test('says when the goal is reached, and flags slow replies', async () => {
    statsApi.getToday.mockResolvedValue({ today: '2026-11-07', bookedToday: 9, avgGpToday: 900, gpToday: 8100, gpLoggedToday: 9, series: series([900, 900, 900, 900, 900, 900, 900]), repliedToday: 2, medianReplyMinutes: 25, repliesByHour: [] });
    renderCard();
    expect(await screen.findByText('Goal reached')).toBeInTheDocument();
    expect(screen.getByText('25 min')).toHaveClass('text-hot');
    expect(screen.getByText('$8,100')).toBeInTheDocument();
  });

  test('says when nothing is booked yet today', async () => {
    statsApi.getToday.mockResolvedValue({ today: '2026-11-07', bookedToday: 0, avgGpToday: null, gpToday: null, gpLoggedToday: 0, series: series([null, null, null, null, null, null, null]), repliedToday: 0, medianReplyMinutes: null, repliesByHour: [] });
    renderCard();
    expect(await screen.findByText('Nothing booked yet today')).toBeInTheDocument();
  });

  test('clicking it opens Stats', async () => {
    statsApi.getToday.mockResolvedValue({ today: '2026-11-07', bookedToday: 0, avgGpToday: null, series: series([null, null, null, null, null, null, null]), repliedToday: 0, medianReplyMinutes: null, repliesByHour: [] });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Today. Open Stats' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/stats');
  });
});
