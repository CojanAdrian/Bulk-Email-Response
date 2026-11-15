import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CloseButton, PILL_PRIMARY, PILL_QUIET } from '../../ui/Sheet';
import { useCarrierCheckState, describeCheck, requestCheck, requestDatCarriers, EXTENSION_URL } from '../../lib/carrierCheck';
import { buildLookupMessage, rateIsShown } from '../../lib/lookupMessage';
import { CarrierBadge } from '../inquiries/CarrierCheck';
import { listOffers, sendOffers } from '../../api/offers';
import { place, schedule } from './boardLogic';

export const DAT_URL = 'https://one.dat.com/';
const REFRESH_MS = 5000;
const GOOD = new Set(['pass', 'partial']);

// What to type into DAT's truck search, and the email subject.
export function laneText(load) {
  const origin = place(load.origin_city, load.origin_state) || 'Origin';
  const dest = place(load.dest_city, load.dest_state) || 'Destination';
  const pickup = schedule(load.early_pu, load.late_pu);
  return [`${origin} → ${dest}`, load.equipment, pickup?.day].filter(Boolean).join(' · ');
}

export function offerSubject(load) {
  const origin = place(load.origin_city, load.origin_state);
  const dest = place(load.dest_city, load.dest_state);
  const pickup = schedule(load.early_pu, load.late_pu);
  return `Load available: ${origin} → ${dest}${pickup ? ` · PU ${pickup.day}` : ''}${load.equipment ? ` · ${load.equipment}` : ''}`;
}

// The carriers a truck search on DAT showed for this load, with their
// Highway result, so the passing ones can be emailed the load in one go.
// The search itself is yours on DAT; the MC Check extension hands its
// carriers to this window and checks each on Highway.
function DatTrucksSheet({ load, onClose, onSent }) {
  const check = useCarrierCheckState();
  const [since, setSince] = useState(() => Date.now() - 60 * 1000);
  const [picked, setPicked] = useState(() => new Map()); // mc -> true/false, set by you
  const [emailed, setEmailed] = useState(() => new Set());
  const [subject, setSubject] = useState(() => offerSubject(load));
  const [body, setBody] = useState(() => buildLookupMessage(load, rateIsShown(load)));
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requested = useRef(new Set());

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Carriers already emailed about this load are never emailed again.
  useEffect(() => {
    Promise.resolve(listOffers(load.id))
      .then((rows) => setEmailed(new Set((rows || []).map((row) => row.email.toLowerCase()))))
      .catch(() => {});
  }, [load.id]);

  // Ask the extension for what DAT showed, now and every few seconds.
  useEffect(() => {
    requestDatCarriers(since);
    const id = setInterval(() => requestDatCarriers(since), REFRESH_MS);
    return () => clearInterval(id);
  }, [since]);

  const carriers = useMemo(
    () =>
      [...check.dat.values()]
        .filter((carrier) => carrier.at >= since)
        .map((carrier) => {
          const status = describeCheck(check, `dat-${carrier.mc}`, [carrier.mc]);
          const email = (carrier.emails || [])[0] || null;
          const already = email ? emailed.has(email.toLowerCase()) : false;
          return { ...carrier, email, already, status };
        }),
    [check, since, emailed]
  );

  // Each new carrier gets its Highway check (saved results come back at once).
  useEffect(() => {
    for (const carrier of carriers) {
      if (requested.current.has(carrier.mc)) continue;
      requested.current.add(carrier.mc);
      requestCheck(`dat-${carrier.mc}`, [carrier.mc]);
    }
  }, [carriers]);

  const canEmail = (carrier) => Boolean(carrier.email) && !carrier.already;
  const isPicked = (carrier) => (picked.has(carrier.mc) ? picked.get(carrier.mc) : GOOD.has(carrier.status.view)) && canEmail(carrier);

  const order = { pass: 0, partial: 1, checking: 2, login: 2, other: 3, not_found: 4, error: 4, nomc: 5, fail: 6, 'no-extension': 7 };
  const sorted = [...carriers].sort((a, b) => (order[a.status.view] ?? 5) - (order[b.status.view] ?? 5) || String(a.name).localeCompare(String(b.name)));
  const chosen = sorted.filter(isPicked);
  const counts = carriers.reduce((acc, c) => ({ ...acc, [c.status.view]: (acc[c.status.view] || 0) + 1 }), {});
  const noEmail = carriers.filter((c) => !c.email).length;

  function openDat() {
    const text = laneText(load);
    navigator.clipboard?.writeText?.(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
    window.open(DAT_URL, '_blank', 'noopener');
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await sendOffers({
        loadId: load.id,
        subject,
        body,
        recipients: chosen.map((c) => ({ email: c.email, name: c.name, mc: c.mc })),
      });
      const sentEmails = (res.results || []).filter((r) => r.ok || r.skipped).map((r) => r.email);
      setEmailed((prev) => new Set([...prev, ...sentEmails]));
      setResult(res);
      onSent?.(res.sent || 0);
    } catch (err) {
      setError(err.message || 'Could not send the emails.');
    } finally {
      setSending(false);
    }
  }

  const failed = (result?.results || []).filter((r) => !r.ok && !r.skipped);

  return (
    <>
      <div className="fixed inset-0 z-[44] bg-black/40" onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Find trucks on DAT for ${load.load_number}`}
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="mat fixed inset-x-3 bottom-[88px] top-[76px] z-[45] m-auto flex max-h-[calc(100dvh-164px)] flex-col overflow-hidden rounded-[34px] text-text md:inset-x-auto md:bottom-[104px] md:left-[52px] md:top-[84px] md:max-h-[calc(100dvh-188px)] md:w-[760px]"
      >
        <CloseButton onClose={onClose} />
        <div className="flex min-h-0 flex-col overflow-y-auto px-8 pb-6 pt-7 [scrollbar-width:none]">
          <p className="caps pr-10">Find trucks on DAT · {load.load_number}</p>
          <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.045em]">{laneText(load)}</h2>

          {check.extension === 'absent' ? (
            <p className="mt-5 rounded-[18px] border border-dashed border-white/[0.14] px-4 py-3 text-[13px] leading-snug text-text-muted">
              <span className="font-semibold text-text">This needs the MC Check extension (version 0.4 or newer).</span> It reads the carriers DAT shows you and checks each on Highway.{' '}
              <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="font-semibold text-text underline-offset-2 hover:underline">
                Get MC Check
              </a>
            </p>
          ) : (
            <ol className="mt-5 grid gap-2 text-[12.5px] text-text-muted sm:grid-cols-3">
              <li className="rounded-[16px] bg-white/[0.045] px-3.5 py-3">
                <span className="font-bold text-text">1</span> Open DAT. The lane is copied, so paste it into the truck search and press Search.
              </li>
              <li className="rounded-[16px] bg-white/[0.045] px-3.5 py-3">
                <span className="font-bold text-text">2</span> The carriers appear here and are checked on Highway.
              </li>
              <li className="rounded-[16px] bg-white/[0.045] px-3.5 py-3">
                <span className="font-bold text-text">3</span> Pass and Partial are ticked. Check the list and email them.
              </li>
            </ol>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={openDat} className={PILL_PRIMARY}>
              {copied ? 'Lane copied · DAT opened' : 'Open DAT and copy the lane'}
            </button>
            {since > 0 && (
              <button type="button" onClick={() => setSince(0)} className={PILL_QUIET} title="Include carriers from DAT searches in the last two hours">
                Show earlier searches
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <p className="caps">Carriers from DAT</p>
            {carriers.length > 0 && (
              <p className="text-[11.5px] text-text-muted">
                {carriers.length} found · {counts.pass || 0} pass · {counts.partial || 0} partial · {counts.fail || 0} fail{noEmail ? ` · ${noEmail} without email` : ''}
              </p>
            )}
          </div>

          {carriers.length === 0 ? (
            <p className="mt-3 rounded-[18px] bg-white/[0.03] px-4 py-6 text-center text-[13px] text-text-muted">
              {check.extension === 'present' ? 'Waiting for a truck search on DAT…' : 'No carriers yet.'}
            </p>
          ) : (
            <ul aria-label="Carriers from DAT" className="mt-2 divide-y divide-white/[0.06] rounded-[18px] bg-white/[0.03]">
              {sorted.map((carrier) => (
                <li key={carrier.mc} className={`flex items-center gap-3 px-4 py-2.5 ${canEmail(carrier) ? '' : 'opacity-55'}`}>
                  <input
                    type="checkbox"
                    aria-label={`Email ${carrier.name || `MC ${carrier.mc}`}`}
                    checked={isPicked(carrier)}
                    disabled={!canEmail(carrier)}
                    onChange={(event) => setPicked((prev) => new Map(prev).set(carrier.mc, event.target.checked))}
                    className="h-4 w-4 shrink-0 accent-white"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{carrier.name || 'Unnamed carrier'}</span>
                      <CarrierBadge check={carrier.status} />
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
                      MC {carrier.mc} · {carrier.already ? 'Already emailed about this load' : carrier.email || 'No email on DAT'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <label className="caps mt-6" htmlFor="dat-subject">
            Email
          </label>
          <input id="dat-subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 w-full rounded-[14px] border px-4 py-2.5 text-[13px] text-text" />
          <textarea
            aria-label="Email text"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            className="mt-2 w-full resize-y rounded-[16px] border px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text"
          />
          <p className="mt-1.5 text-[11px] text-text-muted">Each carrier gets their own email from your Gmail, with your signature. Their replies show up in Inquiries, already matched to this load.</p>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          {result && (
            <p role="status" className="mt-3 text-[13px] text-text">
              Sent to {result.sent} carrier{result.sent === 1 ? '' : 's'}.{failed.length ? ` ${failed.length} could not be sent: ${failed.map((r) => r.email).join(', ')}.` : ''}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={send} disabled={sending || chosen.length === 0} className={PILL_PRIMARY}>
              {sending ? 'Sending…' : chosen.length ? `Email ${chosen.length} carrier${chosen.length === 1 ? '' : 's'}` : 'Pick carriers to email'}
            </button>
            <button type="button" onClick={onClose} className={PILL_QUIET}>
              Done
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

export default DatTrucksSheet;
