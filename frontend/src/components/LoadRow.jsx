import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';
import { formatMoney } from '../lib/formatMoney';
import { formatDayAgo, formatDayFull } from '../lib/formatDay';
import ProvenBadge from './ProvenBadge';
import { ChevronDownIcon } from './icons';
import CopyableLoadNumber from './CopyableLoadNumber';

// One load on the board. Purely presentational: LoadsTable owns every bit
// of state and passes the interactive pieces in as slots, so the row only
// decides layout.
//
// Layout never forces horizontal scroll: the lane wraps, secondary text
// truncates (with a title tooltip), and the controls row wraps onto as many
// lines as the width needs.
function LoadRow({
  load,
  proven,
  expanded,
  onToggleExpand,
  onOpenCarrier,
  leadingSlot,
  badges,
  puField,
  rateField,
  controls,
  actions,
}) {
  const preset = useMotionPreset();
  const provenCount = proven ? proven.length : 0;
  const isProven = provenCount > 0;
  const origin = [load.origin_city, load.origin_state].filter(Boolean).join(', ') || 'Origin missing';
  const dest = [load.dest_city, load.dest_state].filter(Boolean).join(', ') || 'Destination missing';
  const detailsId = `load-${load.id}-proven`;

  return (
    <li
      data-testid="load-row"
      data-proven={isProven ? 'true' : undefined}
      className={`relative min-w-0 overflow-hidden rounded-2xl p-3 text-text glass-hover sm:p-4 ${
        isProven ? 'glass-gold gold-sweep' : 'glass'
      }`}
    >
      <div className="relative flex min-w-0 gap-3">
        {leadingSlot && <div className="flex shrink-0 items-start pt-0.5">{leadingSlot}</div>}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <p className="min-w-0 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] sm:text-base">
              <span>{origin}</span>
              <span aria-label="to" className="mx-1.5 text-text-muted">
                →
              </span>
              <span>{dest}</span>
            </p>
            <div className="shrink-0 text-right">{rateField}</div>
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <CopyableLoadNumber loadNumber={load.load_number} />
            {load.equipment && (
              <>
                <span aria-hidden="true">·</span>
                <span className="rounded-md bg-surface-alt px-1.5 py-0.5 font-semibold text-text">{load.equipment}</span>
              </>
            )}
            {load.weight && (
              <>
                <span aria-hidden="true">·</span>
                <span className="max-w-[10rem] truncate" title={load.weight}>
                  {load.weight}
                </span>
              </>
            )}
            {load.customer && (
              <>
                <span aria-hidden="true">·</span>
                <span className="max-w-[14rem] truncate" title={load.customer}>
                  {load.customer}
                </span>
              </>
            )}
            {(load.load_type === 'contract' || load.load_type === 'spot') && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  load.load_type === 'contract' ? 'bg-info-bg text-info' : 'bg-warning-bg text-warning'
                }`}
              >
                {load.load_type === 'contract' ? 'Contract' : 'Spot'}
              </span>
            )}
            {isProven && (
              <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                aria-controls={detailsId}
                aria-label={`${expanded ? 'Hide' : 'Show'} the ${provenCount} carrier${provenCount === 1 ? '' : 's'} who ran this lane`}
                className="inline-flex items-center gap-0.5 rounded-full transition active:scale-95"
              >
                <ProvenBadge count={provenCount} decorative />
                <ChevronDownIcon
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 text-gold-text transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            )}
            {badges}
          </div>

          <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
            {puField && <div className="min-w-0 max-w-full sm:max-w-[17rem] sm:flex-none">{puField}</div>}
            {controls}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto">
              {actions}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isProven && expanded && (
          <motion.div
            id={detailsId}
            key="proven"
            initial={preset.reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={preset.reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={preset.reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="relative overflow-hidden"
          >
            <ul aria-label={`Carriers who ran ${load.load_number}'s lane`} className="mt-3 grid gap-2 border-t border-gold/30 pt-3 sm:grid-cols-2">
              {proven.map((carrier) => (
                <li key={carrier.carrierId}>
                  {/* Opens the carrier's full profile (contacts, equipment,
                      every lane they've run). */}
                  <button
                    type="button"
                    onClick={() => onOpenCarrier && onOpenCarrier(carrier.carrierId)}
                    aria-label={`Open ${carrier.carrierName}'s profile`}
                    className="group flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-transparent bg-surface/60 px-3 py-2 text-left transition hover:border-gold/50 hover:bg-surface active:scale-[0.99]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold group-hover:underline" title={carrier.carrierName}>
                        {carrier.carrierName}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        Ran it {carrier.runs}× · last <span title={formatDayFull(carrier.lastRanAt)}>{formatDayAgo(carrier.lastRanAt)}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-semibold tabular-nums">{formatMoney(carrier.lastRate)}</span>
                      <ChevronDownIcon aria-hidden="true" className="h-4 w-4 -rotate-90 text-text-muted transition group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default LoadRow;
