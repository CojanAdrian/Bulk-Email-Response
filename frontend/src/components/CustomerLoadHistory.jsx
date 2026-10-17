import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';
import { formatMoney } from '../lib/formatMoney';
import CopyableLoadNumber from './CopyableLoadNumber';
import Card from './Card';
import { BoxIcon, ChevronDownIcon } from './icons';

const STATUS_STYLE = {
  active: { label: 'Available', className: 'bg-success-bg text-success' },
  booked: { label: 'Booked', className: 'bg-tag-bg text-tag' },
  covered: { label: 'Covered', className: 'bg-info-bg text-info' },
};

function shortDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function lane(load) {
  const origin = [load.origin_city, load.origin_state].filter(Boolean).join(', ') || 'Origin missing';
  const dest = [load.dest_city, load.dest_state].filter(Boolean).join(', ') || 'Destination missing';
  return { origin, dest };
}

function LoadHistoryRow({ load, onOpenCarrier, index }) {
  const preset = useMotionPreset();
  const { origin, dest } = lane(load);
  const status = STATUS_STYLE[load.status] || STATUS_STYLE.active;
  const isDone = load.status !== 'active';
  const when = isDone ? shortDateTime(load.done_at) : shortDateTime(load.early_pu);

  return (
    <motion.li
      initial={preset.reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: preset.reduced ? 0 : Math.min(index, 10) * 0.025, type: 'spring', stiffness: 420, damping: 34 }}
      className="glass min-w-0 rounded-2xl p-3 text-text sm:p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">
          {origin}
          <span aria-label="to" className="mx-1.5 text-text-muted">
            →
          </span>
          {dest}
        </p>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-semibold tabular-nums">{formatMoney(isDone && load.rate !== null ? load.rate : load.target_pay)}</p>
          {isDone && load.rate !== null && load.target_pay !== null && (
            <p className="text-[11px] text-text-muted">target {formatMoney(load.target_pay)}</p>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <CopyableLoadNumber loadNumber={load.load_number} />
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}>{status.label}</span>
        {load.equipment && <span className="rounded-md bg-surface-alt px-1.5 py-0.5 font-semibold text-text">{load.equipment}</span>}
        {(load.load_type === 'contract' || load.load_type === 'spot') && (
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${load.load_type === 'contract' ? 'bg-info-bg text-info' : 'bg-warning-bg text-warning'}`}>
            {load.load_type === 'contract' ? 'Contract' : 'Spot'}
          </span>
        )}
        {when && (
          <span>
            {isDone ? 'Booked ' : 'Pickup '}
            {when}
          </span>
        )}
      </div>

      {isDone && (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
          {load.carrier_id ? (
            <button
              type="button"
              onClick={() => onOpenCarrier(load.carrier_id)}
              aria-label={`Open ${load.carrier_name}'s profile`}
              className="group inline-flex min-w-0 items-center gap-1 rounded-full border border-control-border bg-control px-3 py-1 font-semibold text-text transition hover:bg-control-hover"
            >
              <span className="text-text-muted">Hauled by</span>
              <span className="truncate">{load.carrier_name}</span>
              <ChevronDownIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 -rotate-90 text-text-muted transition group-hover:translate-x-0.5" />
            </button>
          ) : (
            <span className="text-text-muted">No carrier logged for this load</span>
          )}
          {load.gp !== null && load.gp !== undefined && (
            <span className="font-semibold tabular-nums text-success">GP {formatMoney(load.gp)}</span>
          )}
        </div>
      )}
    </motion.li>
  );
}

function Section({ title, count, children, empty }) {
  return (
    <section aria-label={title} className="min-w-0 space-y-2.5">
      <h3 className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-text-muted">
        {title}
        <span className="rounded-full bg-control px-2 py-0.5 text-[11px] tabular-nums text-text">{count}</span>
      </h3>
      {count === 0 ? <p className="px-1 text-sm text-text-muted">{empty}</p> : children}
    </section>
  );
}

// A customer's loads: what's still available on the board, then what's
// been booked or covered (newest first) with who hauled it.
function CustomerLoadHistory({ loads, onOpenCarrier }) {
  const { available, done } = loads;
  if (available.length === 0 && done.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-alt text-text-muted">
            <BoxIcon className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-text">No loads in this view</p>
          <p className="max-w-sm text-sm text-text-muted">Try a longer time range or any equipment.</p>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <Section title="Available" count={available.length} empty="Nothing on the board for this customer right now.">
        <ul className="grid min-w-0 gap-2.5 xl:grid-cols-2">
          {available.map((load, i) => (
            <LoadHistoryRow key={load.id} load={load} index={i} onOpenCarrier={onOpenCarrier} />
          ))}
        </ul>
      </Section>
      <Section title="Done" count={done.length} empty="No booked or covered loads yet.">
        <ul className="grid min-w-0 gap-2.5 xl:grid-cols-2">
          {done.map((load, i) => (
            <LoadHistoryRow key={load.id} load={load} index={i} onOpenCarrier={onOpenCarrier} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default CustomerLoadHistory;
