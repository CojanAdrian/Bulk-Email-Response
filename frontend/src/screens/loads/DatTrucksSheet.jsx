import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CloseButton, PILL_PRIMARY, PILL_QUIET } from '../../ui/Sheet';
import { useCarrierCheckState, startCarrierCheck, describeCheck, requestCheck, openOnHighway, findTrucksOnDat, teachDat, forgetDat, EXTENSION_URL } from '../../lib/carrierCheck';
import { buildLookupMessage, rateIsShown } from '../../lib/lookupMessage';
import { CarrierBadge } from '../inquiries/CarrierCheck';
import { listOffers, sendOffers } from '../../api/offers';
import { place, schedule } from './boardLogic';

export const DAT_URL = 'https://one.dat.com/';
const GOOD = new Set(['pass', 'partial']);
const HIGHWAY_WAIT_MS = 90 * 1000; // carriers still unchecked after this are left out
const MIN_VERSION = [0, 5];

// What to search on DAT, and the email subject.
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

const localDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// The lane as the extension's DAT search fills it in. The pickup day is the
// load's own (wall-clock) day, or today when that has passed.
export function datLane(load, now = new Date()) {
  const raw = String(load.early_pu || load.late_pu || '');
  const day = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
  const today = localDay(now);
  return {
    originCity: load.origin_city || '',
    originState: load.origin_state || '',
    originLat: num(load.origin_lat),
    originLng: num(load.origin_lng),
    destCity: load.dest_city || '',
    destState: load.dest_state || '',
    destLat: num(load.dest_lat),
    destLng: num(load.dest_lng),
    pickupDate: day && day >= today ? day : today,
    equipment: load.equipment || '',
  };
}

function newEnough(version) {
  const parts = String(version || '0').split('.').map(Number);
  return parts[0] > MIN_VERSION[0] || (parts[0] === MIN_VERSION[0] && (parts[1] || 0) >= MIN_VERSION[1]);
}

const ERRORS = {
  'dat-login': 'DAT asked for a login. Log in to DAT One in Brave, then search again.',
  'dat-not-ready': 'DAT did not start in time. Search again in a moment.',
  'dat-open': 'Could not open DAT. Search again in a moment.',
  'not-learned': 'MC Check has not learned the DAT search yet.',
  'no-coords': 'This load has no map position for its cities, which DAT needs. Edit the load so its cities are found on the map.',
  changed: 'DAT answered differently than when MC Check learned its search. Redo the DAT setup.',
  http: 'DAT turned the search down. If this keeps happening, redo the DAT setup.',
  timeout: 'DAT took too long to answer. Search again in a moment.',
};

const LEARN_ERRORS = {
  'lane-not-found': 'That search was not this lane. Search exactly the lane below, so MC Check knows which parts to change.',
  'no-carriers-after-search': 'MC Check saw the search but no carriers in the answer. Try the search once more.',
  'too-many-requests': 'DAT sent more than MC Check can follow for one search. Send the extension diagnostics to whoever maintains it.',
};

// Finds trucks on DAT for a load and emails the load, by itself, to every
// carrier there that passes (or partly passes) Highway and has an email.
// The MC Check extension runs the DAT search in a minimized DAT window and
// checks each carrier on Highway; the server sends the emails.
function DatTrucksSheet({ load, onClose, onSent }) {
  const check = useCarrierCheckState();
  const [phase, setPhase] = useState('idle'); // idle searching checking sending done error
  const [stage, setStage] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [emailed, setEmailed] = useState(null); // Set of emails already sent this load, once known
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const deadline = useRef(0);
  const stopRun = useRef(null);
  const lane = useMemo(() => datLane(load), [load]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    startCarrierCheck();
    return () => stopRun.current?.();
  }, []);

  // Carriers already emailed about this load are never emailed again.
  const loadEmailed = useCallback(
    () =>
      Promise.resolve(listOffers(load.id))
        .then((rows) => setEmailed(new Set((rows || []).map((row) => String(row.email).toLowerCase()))))
        .catch(() => setEmailed(new Set())),
    [load.id]
  );
  useEffect(() => {
    loadEmailed();
  }, [loadEmailed]);

  const ready = check.extension === 'present' && newEnough(check.version) && check.datReady;

  const search = useCallback(() => {
    stopRun.current?.();
    setPhase('searching');
    setStage('opening');
    setError(null);
    setResult(null);
    setCarriers([]);
    stopRun.current = findTrucksOnDat(lane, (status) => {
      if (status.stage === 'error') {
        setPhase('error');
        setError(status.code || 'error');
      } else if (status.stage === 'done') {
        const found = status.carriers || [];
        setCarriers(found);
        found.forEach((carrier) => requestCheck(`dat-${carrier.mc}`, [carrier.mc]));
        deadline.current = Date.now() + HIGHWAY_WAIT_MS;
        setPhase(found.length ? 'checking' : 'done');
      } else {
        setStage(status.stage);
      }
    });
  }, [lane]);

  // Starts by itself once everything is ready.
  useEffect(() => {
    if (ready && phase === 'idle') search();
  }, [ready, phase, search]);

  const rows = useMemo(
    () =>
      carriers.map((carrier) => {
        const status = describeCheck(check, `dat-${carrier.mc}`, [carrier.mc]);
        const email = (carrier.emails || [])[0] || null;
        const already = Boolean(email && emailed?.has(email.toLowerCase()));
        return { ...carrier, email, already, status };
      }),
    [carriers, check, emailed]
  );
  const pending = rows.filter((row) => row.status.view === 'checking' || row.status.view === 'login').length;

  // Sends once Highway has answered for every carrier (or the wait is over).
  useEffect(() => {
    if (phase !== 'checking' || emailed === null) return undefined;
    const send = async () => {
      const chosen = rows.filter((row) => GOOD.has(row.status.view) && row.email && !row.already);
      if (!chosen.length) {
        setPhase('done');
        return;
      }
      setPhase('sending');
      try {
        const res = await sendOffers({
          loadId: load.id,
          subject: offerSubject(load),
          body: buildLookupMessage(load, rateIsShown(load)),
          recipients: chosen.map((row) => ({ email: row.email, name: row.name, mc: row.mc })),
        });
        setResult(res);
        onSent?.(res.sent || 0);
      } catch (err) {
        setResult({ sent: 0, results: [], failed: err.message || 'Could not send the emails.' });
      }
      await loadEmailed();
      setPhase('done');
    };
    if (pending === 0) {
      send();
      return undefined;
    }
    const timer = setTimeout(send, Math.max(0, deadline.current - Date.now()));
    return () => clearTimeout(timer);
  }, [phase, pending, rows, emailed, load, onSent, loadEmailed]);

  function setup() {
    navigator.clipboard?.writeText?.(laneText(load)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
    teachDat(lane);
  }

  function redoSetup() {
    stopRun.current?.();
    forgetDat();
    setPhase('idle');
    setError(null);
  }

  const sentTo = new Set((result?.results || []).filter((r) => r.ok).map((r) => String(r.email).toLowerCase()));
  const outcome = (row) => {
    if (row.email && sentTo.has(row.email.toLowerCase())) return { text: 'Emailed', strong: true };
    if (row.already) return { text: 'Already emailed about this load' };
    if (!row.email) return { text: 'No email on DAT' };
    if (row.status.view === 'fail') return { text: 'Failed Highway, not emailed' };
    if (row.status.view === 'not_found') return { text: 'Not on Highway, not emailed' };
    if (row.status.view === 'checking' || row.status.view === 'login') return { text: phase === 'done' ? 'Highway did not answer in time' : 'Checking Highway…' };
    if (GOOD.has(row.status.view)) return { text: phase === 'done' ? 'Not emailed' : 'Will be emailed' };
    return { text: 'Not emailed' };
  };
  const order = { pass: 0, partial: 1, checking: 2, login: 2, other: 3, not_found: 4, error: 4, nomc: 5, fail: 6 };
  const sorted = [...rows].sort((a, b) => (order[a.status.view] ?? 5) - (order[b.status.view] ?? 5) || String(a.name).localeCompare(String(b.name)));
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.status.view]: (acc[row.status.view] || 0) + 1 }), {});
  const failedSends = (result?.results || []).filter((r) => !r.ok && !r.skipped);

  const steps = [
    { key: 'searching', label: 'Searching DAT' },
    { key: 'checking', label: rows.length ? `Checking ${rows.length} carriers on Highway` : 'Checking Highway' },
    { key: 'sending', label: 'Emailing Pass and Partial' },
  ];
  const stepIndex = { searching: 0, checking: 1, sending: 2, done: 3 }[phase] ?? -1;

  let body;
  if (check.extension === 'absent') {
    body = (
      <Note>
        <span className="font-semibold text-text">This needs the MC Check extension in Brave.</span> It searches DAT and checks each carrier on Highway with your logins.{' '}
        <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="font-semibold text-text underline-offset-2 hover:underline">
          Get MC Check
        </a>
      </Note>
    );
  } else if (check.extension === 'unknown') {
    body = <Note>Looking for the MC Check extension…</Note>;
  } else if (!newEnough(check.version)) {
    body = (
      <Note>
        <span className="font-semibold text-text">Update MC Check to version 0.5 or newer</span> (you have {check.version || 'an older one'}). Pull the latest from its bulkposting-bridge branch and reload it in
        brave://extensions.
      </Note>
    );
  } else if (!check.datReady) {
    body = (
      <div className="mt-5 rounded-[20px] bg-white/[0.045] px-5 py-4">
        <p className="text-[14px] font-semibold">One-time setup</p>
        <p className="mt-1.5 text-[13px] leading-snug text-text-muted">
          MC Check needs to see one truck search on DAT to learn how DAT searches. Open DAT, click Search Trucks, enter this exact lane (origin, destination, equipment, date) and press Search. That is it. From then on BulkPosting searches DAT by itself and you never need to open it.
        </p>
        <p className="mt-3 rounded-[14px] bg-black/30 px-3.5 py-2.5 font-mono text-[12.5px]">{laneText(load)}</p>
        {check.datLearnError && (
          <p role="alert" className="mt-3 rounded-xl bg-error-bg px-3 py-2 text-[12.5px] text-error">
            {LEARN_ERRORS[check.datLearnError] || 'MC Check could not learn from that search. Try once more.'}
          </p>
        )}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={setup} className={PILL_PRIMARY}>
            {check.datLearning ? 'Open DAT again' : 'Open DAT for the setup'}
          </button>
          {copied && <span className="text-[12px] text-text-muted">Lane copied</span>}
        </div>
        {check.datLearning && (
          <p role="status" className="mt-3 text-[12.5px] text-text-muted">
            Waiting for your search on DAT… This window carries on by itself once it has seen it.
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <ol aria-label="Progress" className="mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((step, i) => {
            const state = phase === 'error' && i === Math.max(stepIndex, 0) ? 'error' : i < stepIndex ? 'done' : i === stepIndex ? 'now' : 'later';
            return (
              <li
                key={step.key}
                aria-current={state === 'now' ? 'step' : undefined}
                className={`rounded-[16px] px-3.5 py-3 text-[12.5px] ${state === 'now' ? 'bg-white/[0.1] text-text' : 'bg-white/[0.04] text-text-muted'}`}
              >
                <span className="mr-1.5 font-bold text-text">{state === 'done' ? '✓' : i + 1}</span>
                {step.label}
                {state === 'now' && step.key === 'searching' && stage === 'waiting' && ' · waiting a few seconds between searches'}
                {state === 'now' && step.key === 'checking' && pending > 0 && ` · ${pending} left`}
                {state === 'now' && <span className="ml-1 inline-block animate-pulse">…</span>}
              </li>
            );
          })}
        </ol>

        {phase === 'error' && (
          <div role="alert" className="mt-4 rounded-[16px] bg-error-bg px-4 py-3 text-[13px] text-error">
            {ERRORS[error] || 'The DAT search did not work. Search again in a moment.'}
            {error === 'dat-login' && (
              <a href={DAT_URL} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">
                Open DAT
              </a>
            )}
          </div>
        )}

        {phase === 'checking' && check.loginNeeded && (
          <p role="alert" className="mt-4 rounded-[16px] bg-error-bg px-4 py-3 text-[13px] text-error">
            Highway asked for a login.{' '}
            <button type="button" onClick={() => openOnHighway()} className="font-semibold underline">
              Log in to Highway
            </button>{' '}
            and the checks carry on.
          </p>
        )}

        {phase === 'done' && (
          <p role="status" className="mt-4 text-[14px] font-semibold">
            {rows.length === 0
              ? 'DAT showed no trucks for this lane right now.'
              : result?.failed
                ? <span className="text-error">Could not send the emails ({String(result.failed).replace(/\.$/, '')}). Search again to retry.</span>
                : result?.sent
                  ? `Sent to ${result.sent} carrier${result.sent === 1 ? '' : 's'}.`
                  : 'No carrier to email this time.'}
            {failedSends.length > 0 && <span className="ml-1 font-normal text-error">{failedSends.length} could not be sent.</span>}
          </p>
        )}

        {rows.length > 0 && (
          <>
            <p className="mt-5 text-[11.5px] text-text-muted">
              {rows.length} on DAT · {counts.pass || 0} pass · {counts.partial || 0} partial · {counts.fail || 0} fail · {rows.filter((r) => !r.email).length} without email
            </p>
            <ul aria-label="Carriers from DAT" className="mt-2 divide-y divide-white/[0.06] rounded-[18px] bg-white/[0.03]">
              {sorted.map((row) => {
                const out = outcome(row);
                return (
                  <li key={row.mc} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold">{row.name || 'Unnamed carrier'}</span>
                        <CarrierBadge check={row.status} />
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
                        MC {row.mc}
                        {row.email ? ` · ${row.email}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[12px] ${out.strong ? 'font-semibold text-text' : 'text-text-muted'}`}>{out.text}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[44] bg-black/40" onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Trucks on DAT for ${load.load_number}`}
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="mat fixed inset-x-3 bottom-[88px] top-[76px] z-[45] m-auto flex max-h-[calc(100dvh-164px)] flex-col overflow-hidden rounded-[34px] text-text md:inset-x-auto md:bottom-[104px] md:left-[52px] md:top-[84px] md:max-h-[calc(100dvh-188px)] md:w-[700px]"
      >
        <CloseButton onClose={onClose} />
        <div className="flex min-h-0 flex-col overflow-y-auto px-8 pb-6 pt-7 [scrollbar-width:none]">
          <p className="caps pr-10">Trucks on DAT · {load.load_number}</p>
          <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.045em]">{laneText(load)}</h2>
          <p className="mt-1.5 text-[12.5px] text-text-muted">Searches DAT, checks every carrier on Highway, and emails the load to the Pass and Partial ones with an email. Nobody gets it twice.</p>

          {body}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {ready && (phase === 'done' || phase === 'error') && (
              <button type="button" onClick={search} className={PILL_PRIMARY}>
                Search again
              </button>
            )}
            <button type="button" onClick={onClose} className={PILL_QUIET}>
              {phase === 'searching' || phase === 'checking' ? 'Stop' : 'Done'}
            </button>
            {check.datReady && (
              <button type="button" onClick={redoSetup} className="ml-auto text-[11.5px] text-text-muted underline-offset-2 hover:text-text hover:underline">
                Redo DAT setup
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function Note({ children }) {
  return <p className="mt-5 rounded-[18px] border border-dashed border-white/[0.14] px-4 py-3 text-[13px] leading-snug text-text-muted">{children}</p>;
}

export default DatTrucksSheet;
