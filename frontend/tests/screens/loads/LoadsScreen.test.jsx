import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoadsScreen from '../../../src/screens/loads/LoadsScreen';
import ShellContext from '../../../src/shell/ShellContext';
import { getState, resetMapStore } from '../../../src/map/mapStore';
import * as loadsApi from '../../../src/api/loads';
import * as inquiriesApi from '../../../src/api/inquiries';
import * as carriersApi from '../../../src/api/carriers';
import * as carrierMatchesApi from '../../../src/api/carrierMatches';
import * as liveSocket from '../../../src/lib/liveSocket';

vi.mock('../../../src/api/loads');
vi.mock('../../../src/api/inquiries');
vi.mock('../../../src/api/carriers');
vi.mock('../../../src/api/carrierMatches');
vi.mock('../../../src/lib/liveSocket');

const DALLAS = {
  id: 1, load_number: 'L1001', status: 'active', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
  equipment: 'V', weight: '42,000 lb', target_pay: '1500.00', include_rate: 1, customer: 'ALDI, Inc', commodity: 'Grocery / food',
  comment: 'FCFS both ends. Driver must have 2 load locks.', early_pu: '2026-11-16T08:00:00', late_pu: '2026-11-16T14:00:00',
  early_del: '2026-11-17T09:00:00', late_del: '2026-11-17T09:00:00', origin_lat: 32.78, origin_lng: -96.8, dest_lat: 41.88, dest_lng: -87.63,
};
const ATLANTA = {
  id: 2, load_number: 'L2002', status: 'active', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Columbus', dest_state: 'OH',
  equipment: 'R', target_pay: null, include_rate: 1,
};
const LAREDO = {
  id: 3, load_number: 'L3003', status: 'booked', origin_city: 'Laredo', origin_state: 'TX', dest_city: 'Memphis', dest_state: 'TN',
  equipment: 'V', target_pay: '2900.00', include_rate: 0,
};
const REGULAR = { carrierId: 7, carrierName: 'Redline Haul', runs: 4, lastRanAt: '2026-10-28', lastRate: 1850 };

let shell;
let onViewMatches;

function renderScreen(start = '/loads') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <ShellContext.Provider value={shell}>
        <LoadsScreen refreshKey={0} onViewMatches={onViewMatches} />
      </ShellContext.Provider>
    </MemoryRouter>
  );
}

const row = (number) => screen.getByRole('button', { name: new RegExp(`^open load ${number}`, 'i') });
const sheet = () => screen.getByRole('dialog', { name: /^load /i });

describe('LoadsScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMapStore();
    localStorage.clear();
    shell = { notify: vi.fn(), importFile: vi.fn() };
    onViewMatches = vi.fn();
    loadsApi.listLoads.mockResolvedValue([DALLAS, ATLANTA, LAREDO]);
    loadsApi.updateLoad.mockResolvedValue({});
    loadsApi.deleteLoad.mockResolvedValue({ ok: true });
    inquiriesApi.listInquiries.mockResolvedValue([]);
    carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({});
    carrierMatchesApi.getProvenCarriers.mockResolvedValue({});
    liveSocket.subscribe.mockReturnValue(() => {});
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  });

  describe('the board', () => {
    test('lists active loads with lane, number, pickup and rate, and counts every status', async () => {
      renderScreen();
      const dallas = await screen.findByRole('button', { name: /^open load L1001, Dallas, TX to Chicago, IL$/i });
      expect(dallas).toHaveTextContent('Nov 16, 8am–2pm');
      expect(dallas).toHaveTextContent('$1,500');
      expect(row('L2002')).toHaveTextContent('No rate');
      expect(screen.queryByText('L3003')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Active: 2 loads' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Booked: 1 loads' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 loads to cover');
    });

    test('fetches the loads once for the list, the counts and the map', async () => {
      renderScreen();
      await screen.findByText('L1001');
      expect(loadsApi.listLoads.mock.calls.filter((call) => call[0] === undefined)).toHaveLength(1);
    });

    test('the status tabs switch which loads are listed', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Booked: 1 loads' }));
      expect(screen.getByText('L3003')).toBeInTheDocument();
      expect(screen.queryByText('L1001')).not.toBeInTheDocument();
    });

    test('search narrows the list and says when nothing matches', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.change(screen.getByLabelText('Search loads'), { target: { value: 'columbus' } });
      expect(screen.getAllByTestId('load-row')).toHaveLength(1);
      fireEvent.change(screen.getByLabelText('Search loads'), { target: { value: 'zzz' } });
      expect(screen.getByText('No loads match "zzz".')).toBeInTheDocument();
    });

    test('the Needs rate filter keeps only loads without a rate', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: /^needs rate 1$/i }));
      expect(screen.getAllByTestId('load-row')).toHaveLength(1);
      expect(screen.getByText('L2002')).toBeInTheDocument();
    });

    test('says so when there are no loads at all', async () => {
      loadsApi.listLoads.mockResolvedValue([]);
      renderScreen();
      expect(await screen.findByText('No loads found.')).toBeInTheDocument();
    });

    test('shows a load error', async () => {
      loadsApi.listLoads.mockRejectedValue(new Error('Request timed out'));
      renderScreen();
      expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Request timed out');
    });

    test('clicking a load number copies it without opening the load', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Copy load number L1001' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('L1001');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Copy load number L1001' })).toHaveTextContent('Copied');
    });

    test('shows how many carriers are asking about a load', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([
        { id: 5, matched_load_id: 1, from_address: 'a@x.com', subject: 'Re: L1001' },
        { id: 6, matched_load_id: 1, from_address: 'b@x.com', subject: 'L1001?' },
      ]);
      renderScreen();
      expect(await screen.findByText('2 asking')).toBeInTheDocument();
    });

    test('draws a lane on the map for each listed load that has coordinates', async () => {
      renderScreen();
      await screen.findByText('L1001');
      await waitFor(() => expect(getState().lanes.map((lane) => lane.id)).toEqual([1]));
    });

    test('hovering a load focuses its lane on the map', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.pointerEnter(row('L1001').closest('li'));
      await waitFor(() => expect(getState().focusId).toBe(1));
    });
  });

  describe('regulars', () => {
    beforeEach(() => {
      carrierMatchesApi.getProvenCarriers.mockResolvedValue({ 1: [REGULAR] });
      carriersApi.getCarrier.mockResolvedValue({ id: 7, mc_number: '884213', dispatcher_name: 'Marcus', dispatcher_phone: '(312) 555-0142', dispatcher_email: 'marcus@redline.com' });
    });

    test('a proven load lists the carriers who ran its lane, right on the row', async () => {
      renderScreen();
      const chip = await screen.findByRole('button', { name: /^Redline Haul, ran this lane 4 times, last paid \$1,850$/ });
      expect(chip.closest('[data-proven="true"]')).not.toBeNull();
      expect(screen.getByRole('button', { name: /^proven 1$/i })).toBeInTheDocument();
    });

    test('clicking a regular opens their card with contact details, not the load', async () => {
      renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: /^Redline Haul, ran/ }));
      const card = screen.getByRole('dialog', { name: 'Redline Haul on this lane' });
      expect(await within(card).findByText('(312) 555-0142')).toBeInTheDocument();
      expect(within(card).getByText('MC 884213')).toBeInTheDocument();
      expect(within(card).getByText('Marcus, dispatcher')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /^load /i })).not.toBeInTheDocument();
    });

    test('"Email this load" opens the blast with the dispatcher already filled in', async () => {
      renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: /^Redline Haul, ran/ }));
      await screen.findByText('(312) 555-0142');
      fireEvent.click(screen.getByRole('button', { name: 'Email this load' }));
      expect(screen.getByText(/blast email/i, { selector: 'h2' })).toBeInTheDocument();
      expect(screen.getByLabelText(/carrier emails/i)).toHaveValue('marcus@redline.com');
    });
  });

  describe('star carriers', () => {
    beforeEach(() => {
      carrierMatchesApi.getProvenCarriers.mockResolvedValue({ 1: [{ ...REGULAR, starred: true }], 2: [{ ...REGULAR, carrierId: 9, carrierName: 'Plain Haul' }] });
    });

    test('a load your starred carrier ran is marked above a plain proven lane', async () => {
      renderScreen();
      expect(await screen.findByText('Your star carrier ran this lane')).toBeInTheDocument();
      const rows = screen.getAllByTestId('load-row');
      expect(rows[0]).toHaveAttribute('data-star', 'true');
      expect(rows[1]).toHaveAttribute('data-proven', 'true');
      expect(rows[1]).not.toHaveAttribute('data-star');
    });

    test('the Starred filter keeps only those loads', async () => {
      renderScreen();
      await screen.findByText('Your star carrier ran this lane');
      fireEvent.click(screen.getByRole('button', { name: /starred 1$/i }));
      expect(screen.getAllByTestId('load-row')).toHaveLength(1);
    });

    test('its lane on the map is marked as a star lane', async () => {
      renderScreen();
      await screen.findByText('Your star carrier ran this lane');
      await waitFor(() => expect(getState().lanes.find((lane) => lane.id === 1)).toMatchObject({ gold: true, star: true }));
    });
  });

  describe('an open load', () => {
    async function openDallas() {
      renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: /^open load L1001/i }));
      return sheet();
    }

    test('shows the full details: customer, timings, facts and the imported comment', async () => {
      const dialog = await openDallas();
      expect(dialog).toHaveTextContent('ALDI, Inc');
      expect(dialog).toHaveTextContent('Dallas, TX');
      expect(dialog).toHaveTextContent('to Chicago, IL');
      expect(dialog).toHaveTextContent('Nov 16');
      expect(dialog).toHaveTextContent('8am–2pm');
      expect(dialog).toHaveTextContent('FCFS');
      expect(dialog).toHaveTextContent('Nov 17');
      expect(dialog).toHaveTextContent('APPT');
      expect(dialog).toHaveTextContent('42,000 lb');
      expect(dialog).toHaveTextContent('Grocery / food');
      expect(dialog).toHaveTextContent('FCFS both ends. Driver must have 2 load locks.');
      expect(dialog).toHaveTextContent(/mi by road/);
    });

    test('opens straight from its address', async () => {
      renderScreen('/loads/1');
      expect(await screen.findByRole('dialog', { name: 'Load L1001' })).toBeInTheDocument();
    });

    test('Close puts the board back', async () => {
      const dialog = await openDallas();
      const board = screen.getByRole('region', { name: 'Load board', hidden: true });
      expect(board).toHaveAttribute('inert');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(board).not.toHaveAttribute('inert'));
    });

    test('the rate can be edited in place', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: /^edit rate for L1001/i }));
      const input = within(dialog).getByLabelText('Target pay for L1001');
      fireEvent.change(input, { target: { value: '1650' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: 1650 }));
    });

    test('clearing the rate saves the load with no rate', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: /^edit rate for L1001/i }));
      const input = within(dialog).getByLabelText('Target pay for L1001');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);
      await waitFor(() => expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: null }));
    });

    test('turning "Rate in replies" off saves it', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByLabelText('Include rate for L1001'));
      await waitFor(() => expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { include_rate: false }));
    });

    test('marking it booked saves the status and asks which carrier took it', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Status for L1001' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Booked' }));
      await waitFor(() => expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { status: 'booked' }));
      expect(await screen.findByRole('dialog', { name: /running load L1001/i })).toBeInTheDocument();
    });

    test('Delete asks first, then deletes and closes', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      expect(loadsApi.deleteLoad).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(loadsApi.deleteLoad).toHaveBeenCalledWith(1));
      await waitFor(() => expect(screen.getByRole('region', { name: 'Load board', hidden: true })).not.toHaveAttribute('inert'));
    });

    test('a failed action shows its error in the sheet', async () => {
      loadsApi.updateLoad.mockRejectedValue(new Error('Network error'));
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByLabelText('Include rate for L1001'));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network error');
    });

    test('Blast opens the blast email for this load', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Blast' }));
      expect(screen.getByText(/blast email/i, { selector: 'h2' })).toBeInTheDocument();
    });

    test('Edit opens the full edit form', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
      expect(screen.getByText(/edit load L1001/i)).toBeInTheDocument();
    });

    test('Copy puts the carrier-ready details on the clipboard', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/dallas/i));
      expect(await within(dialog).findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    });

    test('Find carriers hands the load to the carrier search', async () => {
      const dialog = await openDallas();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Find carriers' }));
      expect(onViewMatches).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    test('focuses its lane on the map', async () => {
      await openDallas();
      await waitFor(() => expect(getState().focusId).toBe(1));
    });
  });

  describe('tools', () => {
    test('the plus button opens Add load, and the board reloads after one is created', async () => {
      loadsApi.createLoad.mockResolvedValue({ id: 9, load_number: 'NEW1' });
      renderScreen();
      await screen.findByText('L1001');
      const before = loadsApi.listLoads.mock.calls.filter((call) => call[0] === undefined).length;
      fireEvent.click(screen.getByRole('button', { name: 'Add load' }));
      fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'NEW1' } });
      // The form's own submit button comes after the board's plus button.
      fireEvent.click(screen.getAllByRole('button', { name: /^add load$/i }).at(-1));
      await waitFor(() => expect(loadsApi.createLoad).toHaveBeenCalled());
      await waitFor(() => expect(loadsApi.listLoads.mock.calls.filter((call) => call[0] === undefined).length).toBeGreaterThan(before));
    });

    test('Import hands the chosen file to the shell', async () => {
      renderScreen();
      await screen.findByText('L1001');
      const file = new File(['x'], 'board.csv', { type: 'text/csv' });
      fireEvent.change(screen.getByLabelText('Upload loads CSV'), { target: { files: [file] } });
      expect(shell.importFile).toHaveBeenCalledWith(file);
    });

    test('Select mode marks loads and changes their status together', async () => {
      loadsApi.bulkUpdateLoadStatus.mockResolvedValue({ updated: 2 });
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));
      fireEvent.click(row('L2002'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const bar = screen.getByRole('toolbar', { name: 'Selected loads' });
      expect(bar).toHaveTextContent('2 of 2 selected');
      fireEvent.click(within(bar).getByRole('button', { name: 'Covered' }));
      await waitFor(() => expect(loadsApi.bulkUpdateLoadStatus).toHaveBeenCalledWith([1, 2], 'covered'));
    });

    test('the selection bar selects everything and hides the rate in one click each', async () => {
      loadsApi.bulkSetIncludeRate.mockResolvedValue({ updated: 2 });
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      const bar = screen.getByRole('toolbar', { name: 'Selected loads' });
      expect(within(bar).getByRole('button', { name: 'Leave rate out of replies' })).toBeDisabled();
      fireEvent.click(within(bar).getByRole('button', { name: 'Select all' }));
      fireEvent.click(within(bar).getByRole('button', { name: 'Leave rate out of replies' }));
      await waitFor(() => expect(loadsApi.bulkSetIncludeRate).toHaveBeenCalledWith([1, 2], false));
    });

    test('shift-click selects every load in between', async () => {
      loadsApi.listLoads.mockResolvedValue([DALLAS, ATLANTA, LAREDO, { ...ATLANTA, id: 4, load_number: 'L4004' }]);
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(row('L1001'));
      fireEvent.click(row('L4004'), { shiftKey: true });
      expect(screen.getByRole('toolbar', { name: 'Selected loads' })).toHaveTextContent('3 of 3 selected');
    });

    test('Ctrl+A selects every load on screen', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      expect(screen.getByRole('toolbar', { name: 'Selected loads' })).toHaveTextContent('2 of 2 selected');
    });

    test('selected loads can be deleted together after confirming', async () => {
      loadsApi.bulkDeleteLoads.mockResolvedValue({ deleted: 1 });
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Selected loads' })).getByRole('button', { name: 'Delete' }));
      expect(loadsApi.bulkDeleteLoads).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(loadsApi.bulkDeleteLoads).toHaveBeenCalledWith([1]));
    });
  });

  describe('keyboard', () => {
    test('arrow keys move through loads, Enter opens, and C copies the number', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await waitFor(() => expect(getState().focusId).toBe(1));
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      fireEvent.keyDown(window, { key: 'c' });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('L2002');
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(await screen.findByRole('dialog', { name: 'Load L1001' })).toBeInTheDocument();
    });

    test('N opens Add load', async () => {
      renderScreen();
      await screen.findByText('L1001');
      fireEvent.keyDown(window, { key: 'n' });
      expect(screen.getByText(/^add a load$/i)).toBeInTheDocument();
    });
  });
});
