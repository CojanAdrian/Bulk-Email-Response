import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { formatMoney } from '../../lib/formatMoney';
import { buildPUSched } from '../../lib/datExport';
import { buildLookupMessage, detectMultiStop } from '../../lib/lookupMessage';
import DateRangeField from '../../components/DateRangeField';
import Select from '../../components/Select';
import CopyText from '../../ui/CopyText';
import Regulars from './Regulars';
import { SHEET_SPRING, RateHiddenIcon } from './BoardRow';
import { STATUSES, STATUS_LABELS, hasNoRate, place, schedule } from './boardLogic';

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const PILL = 'rounded-full px-5 py-3 text-[13px] font-semibold transition-[scale,background-color] duration-300 ease-spring active:scale-95 disabled:opacity-50';
const QUIET = `${PILL} bg-white/10 text-text hover:bg-white/[0.18]`;

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="caps">{label}</dt>
      <dd className="mt-1.5 truncate text-[20px] font-semibold tracking-[-0.035em] text-text">{children}</dd>
    </div>
  );
}

function Window({ label, sched, children }) {
  return (
    <div className="min-w-0 rounded-[18px] bg-white/[0.055] px-4 py-3.5">
      <p className="caps truncate">{label}</p>
      {sched ? (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold tracking-[-0.025em] text-text">
          {sched.day}
          <span className="text-[12.5px] font-normal tracking-normal text-text-muted">{sched.hours}</span>
          <span className="rounded-[5px] bg-white/[0.12] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.08em]">{sched.kind}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-[15px] text-text-muted">Not set</p>
      )}
      {children}
    </div>
  );
}

// A load opened from the board: everything known about it and every action
// on it. It shares the row's layoutId, so it grows out of the row.
function LoadSheet({
  load, regulars, asking = 0, matchCount = 0, miles = null, busy = false, error = null, pickupValues,
  onClose, onStatusChange, onIncludeRateChange, onSaveRate, onPickupChange, onBlast, onFindCarriers, onEdit, onDelete, onEmail, onOpenCarrier,
}) {
  const [rateDraft, setRateDraft] = useState(null); // null = not editing
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal="true"]:not([data-load-sheet])')) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const origin = place(load.origin_city, load.origin_state) || 'Origin missing';
  const dest = place(load.dest_city, load.dest_state) || 'Destination missing';
  const pickup = schedule(load.early_pu, load.late_pu);
  const delivery = schedule(load.early_del, load.late_del);
  const multiStop = detectMultiStop(load);
  const extraStops = Array.isArray(load.extra_stops) ? load.extra_stops : [];

  function commitRate() {
    if (rateDraft === null) return;
    const draft = rateDraft;
    setRateDraft(null);
    onSaveRate(load, draft);
  }

  function copyDetails() {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(buildLookupMessage(load, Boolean(load.include_rate))).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <motion.div
      layoutId={`load-${load.id}`}
      transition={SHEET_SPRING}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      role="dialog"
      aria-modal="true"
      data-load-sheet
      aria-label={`Load ${load.load_number}`}
      className="mat fixed inset-x-3 bottom-[88px] top-[76px] z-[35] m-auto flex h-fit max-h-[calc(100dvh-164px)] flex-col overflow-hidden rounded-[34px] text-text md:inset-x-auto md:bottom-[104px] md:left-[52px] md:top-[84px] md:max-h-[calc(100dvh-188px)] md:w-[620px]"
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.35 } }} className="flex min-h-0 flex-col overflow-y-auto px-8 pb-6 pt-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 grid h-[30px] w-[30px] place-items-center rounded-full bg-white/10 transition-[rotate,background-color] duration-500 ease-spring hover:rotate-90 hover:bg-white/20"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>

        <p className="caps flex flex-wrap items-center gap-x-2 pr-10">
          {load.customer && <span className="truncate">{load.customer}</span>}
          {load.customer && <span aria-hidden="true">·</span>}
          <span>Load</span>
          <CopyText value={load.load_number} label={`Copy load number ${load.load_number}`} className="mx-0 text-xs normal-case tracking-normal" />
          {(load.load_type === 'contract' || load.load_type === 'spot') && <span>· {load.load_type}</span>}
        </p>

        <h2 className="mt-3 text-[38px] font-bold leading-none tracking-[-0.05em]">
          {origin}
          <span className="block text-text/30">to {dest}</span>
        </h2>
        {miles && <p className="mt-3 text-xs tabular-nums text-text-muted">{miles.toLocaleString()} mi by road, approx.</p>}

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Window label={`Pickup · ${load.origin_city || 'origin'}`} sched={pickup}>
            <div className="mt-2.5">
              <DateRangeField
                legend="Pickup"
                variant="chip"
                showLegend={false}
                earlyId={`pu-early-${load.id}`}
                lateId={`pu-late-${load.id}`}
                earlyValue={pickupValues.early_pu}
                lateValue={pickupValues.late_pu}
                onEarlyChange={(value) => onPickupChange(load, 'early_pu', value)}
                onLateChange={(value) => onPickupChange(load, 'late_pu', value)}
                formatRange={(early, late) => (buildPUSched(early, late) ? 'Change pickup time' : 'Set pickup time')}
              />
            </div>
          </Window>
          <Window label={`Delivery · ${load.dest_city || 'destination'}`} sched={delivery} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-white/[0.07] py-[18px] sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="caps flex items-center gap-1.5">
              Rate
              {!hasNoRate(load) && !Number(load.include_rate) && (
                <span className="flex items-center gap-1 normal-case tracking-normal text-text-muted" title="Replies and blasts leave the rate out">
                  <RateHiddenIcon className="h-3.5 w-3.5" />
                  hidden
                </span>
              )}
            </dt>
            <dd className="mt-1 -ml-1.5">
              {rateDraft !== null ? (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  autoFocus
                  aria-label={`Target pay for ${load.load_number}`}
                  value={rateDraft}
                  onChange={(event) => setRateDraft(event.target.value)}
                  onBlur={commitRate}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRate();
                    } else if (event.key === 'Escape') {
                      event.stopPropagation();
                      setRateDraft(null);
                    }
                  }}
                  className="w-28 rounded-xl border px-2 py-1 text-[18px] font-semibold tabular-nums text-text"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRateDraft(load.target_pay ?? '')}
                  aria-label={`Edit rate for ${load.load_number}, currently ${formatMoney(load.target_pay)}`}
                  title="Click to edit the rate"
                  className={`rounded-lg px-1.5 py-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.035em] transition-colors hover:bg-white/10 ${hasNoRate(load) ? 'text-hot' : 'text-text'}`}
                >
                  {hasNoRate(load) ? 'Add rate' : formatMoney(load.target_pay)}
                </button>
              )}
            </dd>
          </div>
          <Fact label="Equipment">{load.equipment || '—'}</Fact>
          <Fact label="Weight">{load.weight || '—'}</Fact>
          <Fact label="Commodity">{load.commodity || '—'}</Fact>
          {load.temperature && <Fact label="Temperature">{load.temperature}</Fact>}
          {Number(load.stops) > 0 && <Fact label="Stops">{load.stops}</Fact>}
        </dl>

        {extraStops.length > 0 && (
          <div className="mt-4">
            <p className="caps">Extra stops</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-text">
              {extraStops.map((stop, index) => (
                <li key={index}>
                  <span className="text-text-muted">{stop.type === 'delivery' ? 'Delivery' : 'Pickup'}:</span> {place(stop.city, stop.state)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {multiStop && extraStops.length === 0 && <p className="mt-4 text-[13px] font-medium text-hot">{multiStop}. Add the extra stops in Edit so replies include them.</p>}

        {load.comment && (
          <div className="mt-4">
            <p className="caps">Planning comment</p>
            <p className="mt-1.5 select-text whitespace-pre-wrap text-[13px] leading-normal text-text">{load.comment}</p>
          </div>
        )}

        <div className="mt-4">
          {regulars?.length > 0 ? (
            <>
              <p className="caps mb-2 !text-gold">{regulars.some((r) => r.starred) ? 'Your star carrier ran this lane' : 'Regulars on this lane'}</p>
              <Regulars load={load} regulars={regulars} onEmail={onEmail} onOpenCarrier={onOpenCarrier} />
            </>
          ) : (
            <p className="text-[13px] text-text-muted">
              {asking > 0 ? (
                <>
                  <b className="font-semibold text-hot">{asking} carrier{asking === 1 ? '' : 's'} asking</b> about this load right now.
                </>
              ) : matchCount > 0 ? (
                `${matchCount} carrier${matchCount === 1 ? '' : 's'} in your list run near this lane.`
              ) : (
                'No one has run this lane for you yet.'
              )}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Select
            ariaLabel={`Status for ${load.load_number}`}
            value={load.status}
            onChange={(value) => onStatusChange(load, value)}
            options={STATUS_OPTIONS}
            disabled={busy}
            size="sm"
          />
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-text">
            <input
              type="checkbox"
              aria-label={`Include rate for ${load.load_number}`}
              checked={Boolean(load.include_rate)}
              onChange={(event) => onIncludeRateChange(load, event.target.checked)}
              disabled={busy}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-white/[0.14] transition-colors duration-300 after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-[translate] after:duration-500 after:ease-spring peer-checked:bg-success peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-focus"
            />
            <span aria-hidden="true">Rate in replies</span>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {confirmingDelete ? (
            <>
              <span className="self-center text-[13px] text-error">Delete load {load.load_number}?</span>
              <button type="button" onClick={() => onDelete(load)} disabled={busy} className={`${PILL} bg-error text-black`}>
                {busy ? 'Deleting...' : 'Confirm'}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} className={QUIET}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onBlast(load)} title="Email this load to carriers" className={`${PILL} bg-accent text-accent-ink`}>
                Blast
              </button>
              <button type="button" onClick={() => onFindCarriers(load)} className={QUIET}>
                Find carriers
              </button>
              <button type="button" onClick={copyDetails} title="Copy the load details for a carrier" className={QUIET}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button type="button" onClick={() => onEdit(load)} className={QUIET}>
                Edit
              </button>
              <button type="button" onClick={() => setConfirmingDelete(true)} aria-label="Delete" title={`Delete load ${load.load_number}`} className={`${PILL} ml-auto bg-transparent text-error hover:bg-error-bg`}>
                Delete
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default LoadSheet;
