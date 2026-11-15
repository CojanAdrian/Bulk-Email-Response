import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import DatTrucksSheet, { laneText, offerSubject, datLane } from '../../../src/screens/loads/DatTrucksSheet';
import { resetCarrierCheck } from '../../../src/lib/carrierCheck';
import * as offersApi from '../../../src/api/offers';

vi.mock('../../../src/api/offers');

const LOAD = {
  id: 7, load_number: 'L7', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX',
  origin_lat: '41.878100', origin_lng: '-87.629800', dest_lat: '32.776700', dest_lng: '-96.797000',
  equipment: 'V', target_pay: 2450, include_rate: 1, weight: '42000', early_pu: '2099-11-18T08:00:00', late_pu: '2099-11-18T08:00:00',
};

const DAT = [
  { mc: '1', name: 'PASS TRUCKING', emails: ['pass@x.com'], phones: [] },
  { mc: '2', name: 'PARTIAL LINES', emails: ['partial@x.com'], phones: [] },
  { mc: '3', name: 'FAIL FREIGHT', emails: ['fail@x.com'], phones: [] },
  { mc: '4', name: 'NO EMAIL INC', emails: [], phones: ['3125550100'] },
];
const HIGHWAY = { 1: 'pass', 2: 'partial', 3: 'fail', 4: 'pass' };

// Answers like the MC Check extension (0.5) bridge.
function fakeExtension({ version = '0.6.0', datReady = true, findResult = { stage: 'done', carriers: DAT } } = {}) {
  const seen = [];
  const reply = (msg) => window.dispatchEvent(new MessageEvent('message', { data: { source: 'mc-check', ...msg }, source: window }));
  function onMessage(event) {
    const msg = event.data;
    if (!msg || msg.source !== 'bulkposting') return;
    seen.push(msg);
    if (msg.type === 'hello') setTimeout(() => reply({ type: 'ready', version, datReady }));
    if (msg.type === 'dat-find') {
      setTimeout(() => {
        reply({ type: 'dat-find-status', id: msg.id, stage: 'searching' });
        reply({ type: 'dat-find-status', id: msg.id, ...findResult });
      });
    }
    if (msg.type === 'lookup') {
      const mc = msg.mcs[0];
      setTimeout(() => {
        reply({ type: 'picked', key: msg.key, mc });
        reply({ type: 'result', mc, result: { status: HIGHWAY[mc], label: HIGHWAY[mc] } });
      });
    }
  }
  window.addEventListener('message', onMessage);
  return { seen, reply, stop: () => window.removeEventListener('message', onMessage) };
}

const settle = async (n = 6) => {
  for (let i = 0; i < n; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
};

describe('Trucks on DAT', () => {
  let ext;
  beforeEach(() => {
    vi.clearAllMocks();
    resetCarrierCheck();
    offersApi.listOffers.mockResolvedValue([]);
    offersApi.sendOffers.mockImplementation(async ({ recipients }) => ({ sent: recipients.length, results: recipients.map((r) => ({ email: r.email, ok: true })) }));
  });
  afterEach(() => ext?.stop());

  test('lane text, subject and the lane for DAT come from the load', () => {
    expect(laneText(LOAD)).toMatch(/^Chicago, IL → Dallas, TX · V · /);
    expect(offerSubject(LOAD)).toMatch(/^Load available: Chicago, IL → Dallas, TX · PU .+ · V$/);
    expect(datLane(LOAD)).toEqual({
      originCity: 'Chicago', originState: 'IL', originLat: 41.8781, originLng: -87.6298,
      destCity: 'Dallas', destState: 'TX', destLat: 32.7767, destLng: -96.797,
      pickupDate: '2099-11-18', equipment: 'V',
    });
    expect(datLane({ ...LOAD, early_pu: '2001-01-02T08:00:00' }, new Date(2026, 10, 15)).pickupDate).toBe('2026-11-15');
  });

  test('searches DAT, checks Highway and emails Pass and Partial by itself', async () => {
    ext = fakeExtension();
    const onSent = vi.fn();
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} onSent={onSent} />);
    await settle(10);
    const find = ext.seen.find((m) => m.type === 'dat-find');
    expect(find.lane).toMatchObject({ originCity: 'Chicago', destCity: 'Dallas', pickupDate: '2099-11-18' });
    await waitFor(() => expect(offersApi.sendOffers).toHaveBeenCalledTimes(1));
    const call = offersApi.sendOffers.mock.calls[0][0];
    expect(call.loadId).toBe(7);
    expect(call.recipients.map((r) => r.email)).toEqual(['pass@x.com', 'partial@x.com']);
    expect(call.body).toContain('PU: CHICAGO, IL');
    expect(await screen.findByText('Sent to 2 carriers.')).toBeInTheDocument();
    expect(screen.getByText('Failed Highway, not emailed')).toBeInTheDocument();
    expect(screen.getByText('No email on DAT')).toBeInTheDocument();
    expect(onSent).toHaveBeenCalledWith(2);
  });

  test('a carrier already emailed about this load is not emailed again', async () => {
    offersApi.listOffers.mockResolvedValue([{ email: 'pass@x.com' }]);
    ext = fakeExtension();
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    await waitFor(() => expect(offersApi.sendOffers).toHaveBeenCalled());
    expect(offersApi.sendOffers.mock.calls[0][0].recipients.map((r) => r.email)).toEqual(['partial@x.com']);
  });

  test('an older MC Check is asked to update, and nothing is searched', async () => {
    ext = fakeExtension({ version: '0.5.0' });
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    await settle();
    expect(screen.getByText(/Update MC Check to version 0.6 or newer/)).toBeInTheDocument();
    expect(ext.seen.some((m) => m.type === 'dat-find')).toBe(false);
  });

  test('a DAT page the extension could not fill is explained', async () => {
    ext = fakeExtension({ findResult: { stage: 'error', code: 'form-not-found' } });
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    expect(await screen.findByText(/could not find the truck search form on DAT/)).toBeInTheDocument();
  });

  test('a DAT login problem is explained', async () => {
    ext = fakeExtension({ findResult: { stage: 'error', code: 'dat-login' } });
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    expect(await screen.findByText(/DAT asked for a login/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search again' })).toBeInTheDocument();
    expect(offersApi.sendOffers).not.toHaveBeenCalled();
  });
});
