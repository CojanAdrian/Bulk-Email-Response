import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useCarrierCheck, resetCarrierCheck, inquiryMcs } from '../../src/lib/carrierCheck';
import { CarrierBadge, CarrierCheckCard } from '../../src/screens/inquiries/CarrierCheck';

// A stand-in for the MC Check extension: answers the page the way its
// app-bridge.js does.
function fakeExtension(results) {
  const asked = [];
  const reply = (msg) => window.dispatchEvent(new MessageEvent('message', { data: { source: 'mc-check', ...msg }, source: window }));
  function onMessage(event) {
    const msg = event.data;
    if (!msg || msg.source !== 'bulkposting') return;
    asked.push(msg);
    if (msg.type === 'hello') setTimeout(() => reply({ type: 'ready', version: '0.3.0' }));
    if (msg.type === 'lookup') {
      const mc = msg.mcs.find((m) => m !== '999') || null; // 999 stands for an ignored MC#
      setTimeout(() => {
        reply({ type: 'picked', key: msg.key, mc });
        if (mc && results[mc]) reply({ type: 'result', mc, result: results[mc] });
      });
    }
  }
  window.addEventListener('message', onMessage);
  return { asked, stop: () => window.removeEventListener('message', onMessage) };
}

function Probe({ inquiry }) {
  const check = useCarrierCheck(inquiry);
  return (
    <>
      <CarrierBadge check={check} />
      <CarrierCheckCard check={check} />
    </>
  );
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe('carrier check', () => {
  let ext;
  beforeEach(() => resetCarrierCheck());
  afterEach(() => {
    ext?.stop();
    ext = null;
    vi.useRealTimers();
  });

  test('finds MC#s from the server, or in older inquiries from the subject and email start', () => {
    expect(inquiryMcs({ carrier_mcs: '884213,0012' })).toEqual(['884213', '12']);
    expect(inquiryMcs({ subject: 'Re: 0094249', body_snippet: 'Can do it. MC# 689501' })).toEqual(['689501']);
  });

  test('shows Pass with the carrier and MC#', async () => {
    ext = fakeExtension({ 884213: { status: 'pass', label: 'Pass', name: 'REDLINE HAUL LLC', checkedAt: Date.now() } });
    render(<Probe inquiry={{ id: 1, carrier_mcs: '884213' }} />);
    await flush();
    await flush();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Passes your Highway rules')).toBeInTheDocument();
    expect(screen.getByText(/REDLINE HAUL LLC · MC 884213/)).toBeInTheDocument();
  });

  test('shows Fail, skipping an ignored MC# first', async () => {
    ext = fakeExtension({ 555: { status: 'fail', label: 'Fail' } });
    render(<Probe inquiry={{ id: 2, carrier_mcs: '999,555' }} />);
    await flush();
    await flush();
    expect(screen.getByText('Fails your Highway rules')).toBeInTheDocument();
    expect(screen.getByText(/Do not book this carrier/)).toBeInTheDocument();
  });

  test('says when the email has no MC#', async () => {
    ext = fakeExtension({});
    render(<Probe inquiry={{ id: 3, subject: 'Truck available', body_snippet: 'Empty in Ohio' }} />);
    await flush();
    expect(screen.getByText('No MC# in this email')).toBeInTheDocument();
  });

  test('without the extension, the row shows nothing and the inquiry explains how to add it', async () => {
    vi.useFakeTimers();
    render(<Probe inquiry={{ id: 4, carrier_mcs: '884213' }} />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText('Highway…')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get MC Check' })).toHaveAttribute('href', expect.stringContaining('Gmail-Highway-Extension'));
  });

  test('Check again asks the extension for a fresh lookup', async () => {
    ext = fakeExtension({ 884213: { status: 'partial', label: 'Partial Pass' } });
    render(<Probe inquiry={{ id: 5, carrier_mcs: '884213' }} />);
    await flush();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await flush();
    expect(ext.asked.filter((m) => m.type === 'lookup').pop()).toMatchObject({ force: true, mcs: ['884213'] });
  });
});
