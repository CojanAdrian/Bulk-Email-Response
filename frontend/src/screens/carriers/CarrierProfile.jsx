import { useEffect, useState } from 'react';
import { getCarrier } from '../../api/carriers';
import Sheet, { PILL_DANGER, PILL_PRIMARY, PILL_QUIET } from '../../ui/Sheet';
import CopyText from '../../ui/CopyText';
import { formatMoney } from '../../lib/formatMoney';
import { formatDayAgo } from '../../lib/formatDay';
import { EQUIPMENT_OPTIONS } from '../../lib/equipmentOptions';

const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT_OPTIONS.map((option) => [option.code, option.label]));

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

function totals(history) {
  const rates = history.map((run) => Number(run.rate)).filter(Number.isFinite);
  const gps = history.map((run) => Number(run.gp)).filter((gp) => Number.isFinite(gp) && gp !== 0);
  const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return { runs: history.length, avgRate: avg(rates), avgGp: avg(gps) };
}

// One carrier: how to reach them, what they pull, where they run, and
// every run they have done for you. Hovering a run focuses it on the map.
function CarrierProfile({ carrierId, history, refreshKey = 0, onClose, onEdit, onDelete, onHoverRun, deleting }) {
  const [carrier, setCarrier] = useState(null);
  const [status, setStatus] = useState('loading');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (!refreshKey) setStatus('loading');
    Promise.resolve(getCarrier(carrierId))
      .then((data) => {
        if (ignore) return;
        setCarrier(data);
        setStatus('ready');
      })
      .catch(() => {
        if (!ignore) setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, [carrierId, refreshKey]);

  const runs = history || [];
  const summary = totals(runs);
  const equipment = Array.isArray(carrier?.equipment_types) ? carrier.equipment_types : [];
  const states = Array.isArray(carrier?.operating_states) ? carrier.operating_states : [];

  return (
    <Sheet layoutId={`carrier-${carrierId}`} label={carrier ? carrier.company_name : 'Carrier'} onClose={onClose} width="lg">
      {status === 'loading' && <p className="py-10 text-center text-sm text-text-muted">Loading carrier...</p>}
      {status === 'error' && (
        <p role="alert" className="py-10 text-center text-sm text-error">
          Could not load this carrier.
        </p>
      )}
      {status === 'ready' && carrier && (
        <>
          <div className="flex items-center gap-4 pr-10">
            <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-accent text-lg font-bold text-accent-ink">
              {initials(carrier.company_name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[32px] font-bold leading-none tracking-[-0.05em]">{carrier.company_name}</h2>
              <p className="mt-1.5 text-[13px] text-text-muted">{carrier.mc_number ? <CopyText value={carrier.mc_number} label="Copy MC number">MC {carrier.mc_number}</CopyText> : 'No MC on file'}</p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-x-6 border-y border-white/[0.07] py-[18px]">
            <div>
              <dt className="caps">Runs for you</dt>
              <dd className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] tabular-nums">{summary.runs}</dd>
            </div>
            <div>
              <dt className="caps">Avg rate</dt>
              <dd className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] tabular-nums">{formatMoney(summary.avgRate)}</dd>
            </div>
            <div>
              <dt className="caps">Avg margin</dt>
              <dd className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] tabular-nums text-success">{formatMoney(summary.avgGp)}</dd>
            </div>
          </dl>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-[18px] bg-white/[0.055] px-4 py-3.5">
              <p className="caps">Dispatcher</p>
              <p className="mt-1.5 truncate text-[15px] font-semibold">{carrier.dispatcher_name || 'Not on file'}</p>
              <div className="mt-1 flex flex-col items-start gap-0.5 text-[13px]">
                {carrier.dispatcher_phone && <CopyText value={carrier.dispatcher_phone} label="Copy phone number" />}
                {carrier.dispatcher_email && <CopyText value={carrier.dispatcher_email} label="Copy email address" />}
              </div>
            </div>
            <div className="rounded-[18px] bg-white/[0.055] px-4 py-3.5">
              <p className="caps">Runs</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {equipment.length === 0 && <span className="text-[13px] text-text-muted">Equipment not on file</span>}
                {equipment.map((code) => (
                  <span key={code} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] font-semibold">
                    {EQUIPMENT_LABEL[code] || code}
                  </span>
                ))}
              </div>
              {states.length > 0 && <p className="mt-2 text-[12px] leading-snug text-text-muted">{states.join(' · ')}</p>}
            </div>
          </div>
          {(carrier.comment || carrier.equipment_notes || carrier.operating_notes) && (
            <p className="mt-3 select-text whitespace-pre-wrap text-[13px] leading-normal text-text-muted">{[carrier.comment, carrier.equipment_notes, carrier.operating_notes].filter(Boolean).join('\n')}</p>
          )}

          <p className="caps mt-5">Lane history</p>
          {runs.length === 0 && <p className="mt-2 text-[13px] text-text-muted">No runs logged yet. Book a load with them, or add a run in Edit.</p>}
          {runs.length > 0 && (
            <ul className="mt-1.5" onPointerLeave={() => onHoverRun(null)}>
              {runs.map((run) => (
                <li
                  key={run.id}
                  onPointerEnter={() => onHoverRun(`run-${run.id}`)}
                  className="-mx-3 grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold tracking-[-0.015em]">
                      {run.origin_city}, {run.origin_state}
                      <span className="px-1.5 text-text/30">→</span>
                      {run.dest_city}, {run.dest_state}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-text-muted">
                      {run.ran_at && <span>{formatDayAgo(run.ran_at)}</span>}
                      {run.load_number && <CopyText value={run.load_number} label={`Copy load number ${run.load_number}`} />}
                      {run.effective_customer && <span className="truncate">{run.effective_customer}</span>}
                      {run.driver_name && <span>driver {run.driver_name}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-semibold tabular-nums">{formatMoney(run.rate)}</p>
                    {run.gp !== null && run.gp !== undefined && <p className="text-[11.5px] tabular-nums text-success">+{formatMoney(run.gp)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {confirming ? (
              <>
                <span className="self-center text-[13px] text-error">Delete {carrier.company_name} and their lane history?</span>
                <button type="button" onClick={() => onDelete(carrier)} disabled={deleting} className="rounded-full bg-error px-5 py-3 text-[13px] font-semibold text-black disabled:opacity-60">
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={PILL_QUIET}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onEdit(carrier)} className={PILL_PRIMARY}>
                  Edit
                </button>
                {carrier.dispatcher_email && (
                  <a href={`mailto:${carrier.dispatcher_email}`} className={PILL_QUIET}>
                    Email
                  </a>
                )}
                <button type="button" onClick={() => setConfirming(true)} className={`${PILL_DANGER} ml-auto`}>
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

export default CarrierProfile;
