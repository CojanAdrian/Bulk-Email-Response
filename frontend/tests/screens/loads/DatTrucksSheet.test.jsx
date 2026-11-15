import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import DatTrucksSheet, { laneText, offerSubject } from '../../../src/screens/loads/DatTrucksSheet';
import { resetCarrierCheck } from '../../../src/lib/carrierCheck';
import * as offersApi from '../../../src/api/offers';

vi.mock('../../../src/api/offers');

const LOAD = {
  id: 7, load_number: 'L7', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX',
  equipment: 'V', target_pay: 2450, include_rate: 1, weight: '42000', early_pu: '2026-11-18T08:00:00', late_pu: '2026-11-18T08:00:00',
};

const now = Date.now();
const DAT = [
  { mc: '1', name: 'PASS TRUCKING', emails: ['pass@x.com'], phones: [], at: now },
  { mc: '2', name: 'PARTIAL LINES', emails: ['partial@x.com'], phones: [], at: now },
  { mc: '3', name: 'FAIL FREIGHT', emails: ['fail@x.com'], phones: [], at: now },
  { mc: '4', name: 'NO EMAIL INC', emails: [], phones: ['3125550100'], at: now },
  { mc: '5', name: 'OLD SEARCH LLC', emails: ['old@x.com'], phones: [], at: now - 3 * 3600 * 1000 },
];
const HIGHWAY = { 1: 'pass', 2: 'partial', 3: 'fail', 4: 'pass', 5: 'pass' };

// Answers like the MC Check extension's bridge.
function fakeExtension() {
  const reply = (msg) => window.dispatchEvent(new MessageEvent('message', { data: { source: 'mc-check', ...msg }, source: window }));
  function onMessage(event) {
    const msg = event.data;
    if (!msg || msg.source !== 'bulkposting') return;
    if (msg.type === 'hello') setTimeout(() => reply({ type: 'ready', version: '0.4.0' }));
    if (msg.type === 'dat-list') setTimeout(() => reply({ type: 'dat-carriers', carriers: DAT }));
    if (msg.type === 'lookup') {
      const mc = msg.mcs[0];
      setTimeout(() => {
        reply({ type: 'picked', key: msg.key, mc });
        reply({ type: 'result', mc, result: { status: HIGHWAY[mc], label: HIGHWAY[mc] } });
      });
    }
  }
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

describe('Find trucks on DAT', () => {
  let stop;
  beforeEach(() => {
    resetCarrierCheck();
    offersApi.listOffers.mockResolvedValue([]);
    offersApi.sendOffers.mockResolvedValue({ sent: 2, results: [{ email: 'pass@x.com', ok: true }, { email: 'partial@x.com', ok: true }] });
    stop = fakeExtension();
  });
  afterEach(() => stop());

  test('lane text and subject come from the load', () => {
    expect(laneText(LOAD)).toMatch(/^Chicago, IL → Dallas, TX · V · /);
    expect(offerSubject(LOAD)).toMatch(/^Load available: Chicago, IL → Dallas, TX · PU .+ · V$/);
  });

  test('ticks the Pass and Partial carriers with an email, and emails them', async () => {
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    for (let i = 0; i < 4; i++) await settle();
    const list = screen.getByRole('list', { name: 'Carriers from DAT' });
    expect(within(list).queryByText('OLD SEARCH LLC')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Email PASS TRUCKING' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Email PARTIAL LINES' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Email FAIL FREIGHT' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Email NO EMAIL INC' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Email 2 carriers' }));
    await waitFor(() => expect(offersApi.sendOffers).toHaveBeenCalled());
    const call = offersApi.sendOffers.mock.calls[0][0];
    expect(call.loadId).toBe(7);
    expect(call.recipients.map((r) => r.email)).toEqual(['pass@x.com', 'partial@x.com']);
    expect(call.body).toContain('PU: CHICAGO, IL');
    expect(await screen.findByText('Sent to 2 carriers.')).toBeInTheDocument();
  });

  test('a carrier already emailed about this load cannot be picked again', async () => {
    offersApi.listOffers.mockResolvedValue([{ email: 'pass@x.com' }]);
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    for (let i = 0; i < 4; i++) await settle();
    expect(screen.getByRole('checkbox', { name: 'Email PASS TRUCKING' })).toBeDisabled();
    expect(screen.getByText(/Already emailed about this load/)).toBeInTheDocument();
  });

  test('earlier searches can be included', async () => {
    render(<DatTrucksSheet load={LOAD} onClose={vi.fn()} />);
    for (let i = 0; i < 3; i++) await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier searches' }));
    for (let i = 0; i < 3; i++) await settle();
    expect(screen.getByText('OLD SEARCH LLC')).toBeInTheDocument();
  });
});
