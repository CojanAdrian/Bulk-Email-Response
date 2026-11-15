import { motion } from 'framer-motion';
import { formatMoney } from '../../lib/formatMoney';
import { multiStopTagVariant, detectMultiStop } from '../../lib/lookupMessage';
import SelectionCircle from '../../components/SelectionCircle';
import CopyText from '../../ui/CopyText';
import Regulars from './Regulars';
import { hasNoRate, hasStarRegular, place, schedule } from './boardLogic';
import { StarIcon } from '../../ui/StarButton';

// An eye with a line through it: the rate is left out of replies.
export function RateHiddenIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M2 8s2.2-4.5 6-4.5S14 8 14 8s-2.2 4.5-6 4.5S2 8 2 8z" />
      <circle cx="8" cy="8" r="1.8" />
      <path d="M2.5 13.5l11-11" />
    </svg>
  );
}

// An open eye: the rate goes out in replies and blasts.
export function RateShownIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M2 8s2.2-4.5 6-4.5S14 8 14 8s-2.2 4.5-6 4.5S2 8 2 8z" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

// The eye beside a rate. Click to hide the rate from replies and blasts, or
// to show it again. A hidden rate always shows its crossed eye; a shown one
// shows a faint open eye on hover.
export function RateEye({ load, onToggle, className = '' }) {
  if (hasNoRate(load)) return null;
  const hidden = !Number(load.include_rate);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.(load, hidden);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-pressed={hidden}
      aria-label={hidden ? `Show the rate for ${load.load_number} in replies` : `Hide the rate for ${load.load_number} from replies`}
      title={hidden ? 'Rate hidden from replies. Click to show it.' : 'Click to hide the rate from replies.'}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full outline-none transition duration-150 hover:bg-white/[0.12] hover:text-text focus-visible:bg-white/[0.12] focus-visible:opacity-100 ${
        hidden ? 'text-text/55' : 'text-text/40 opacity-0 group-hover:opacity-100'
      } ${className}`}
    >
      {hidden ? <RateHiddenIcon className="h-4 w-4" /> : <RateShownIcon className="h-4 w-4" />}
    </button>
  );
}

export const SHEET_SPRING = { type: 'spring', stiffness: 260, damping: 28 };

function LaneArrow() {
  return (
    <svg viewBox="0 0 30 8" preserveAspectRatio="xMaxYMid slice" fill="none" aria-hidden="true" className="lane-arrow h-2 w-[18px] shrink-0 text-text/30">
      <path d="M0 4h29M25.5 1l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One load on the board. Clicking it (or Enter) opens the load; the row
// itself grows into the detail sheet, which shares its layoutId.
function BoardRow({ load, regulars, asking = 0, matchCount = 0, current, selecting, selected, onOpen, onHover, onToggleSelect, onEmail, onOpenCarrier, onToggleRate, onOpenAsking }) {
  const proven = Boolean(regulars?.length);
  const starRun = hasStarRegular(regulars);
  const pickup = schedule(load.early_pu, load.late_pu);
  const rateHidden = !hasNoRate(load) && !Number(load.include_rate);
  const stops = multiStopTagVariant(load);
  const stopLabel = detectMultiStop(load);
  const origin = place(load.origin_city, load.origin_state) || 'Origin missing';
  const dest = place(load.dest_city, load.dest_state) || 'Destination missing';

  function activate(event) {
    if (selecting) onToggleSelect(load.id, event);
    else onOpen(load);
  }

  return (
    <li data-testid="load-row" data-row-id={load.id} data-proven={proven ? 'true' : undefined} data-star={starRun ? 'true' : undefined} onPointerEnter={() => onHover(load.id)}>
      <motion.div
        layoutId={`load-${load.id}`}
        transition={SHEET_SPRING}
        role="button"
        tabIndex={0}
        aria-label={`Open load ${load.load_number}, ${origin} to ${dest}`}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            activate(event);
          }
        }}
        className={`group relative grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-[18px] px-[18px] py-[13px] outline-none transition-colors duration-200 hover:bg-white/[0.065] focus-visible:bg-white/[0.065] ${
          starRun ? 'star-row my-1.5' : ''
        } ${current || selected ? 'bg-white/[0.065]' : ''} [&:hover_.lane-arrow]:w-[30px] [&:hover_.lane-arrow]:text-text`}
      >
        {proven && !starRun && <span aria-hidden="true" className="absolute bottom-4 left-1.5 top-4 w-0.5 rounded-full bg-gold shadow-[0_0_12px_rgb(var(--color-gold))]" />}

        <span className="flex" onClick={(event) => event.stopPropagation()}>
          {selecting && <SelectionCircle selected={selected} onToggle={(event) => onToggleSelect(load.id, event)} ariaLabel={`Select ${load.load_number}`} />}
        </span>

        <div className="min-w-0">
          <p className={`flex min-w-0 flex-wrap items-center gap-x-[9px] text-[15.5px] font-semibold tracking-[-0.022em] md:flex-nowrap ${proven ? 'text-gold' : 'text-text'}`}>
            <span className="md:truncate">{origin}</span>
            <LaneArrow />
            <span className="md:truncate">{dest}</span>
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <CopyText value={load.load_number} label={`Copy load number ${load.load_number}`} />
            {pickup && (
              <>
                <span aria-hidden="true" className="text-text/30">·</span>
                <span className="tabular-nums">
                  {pickup.day}, {pickup.hours}
                  {pickup.kind === 'APPT' ? ' appt' : ''}
                </span>
              </>
            )}
            {load.equipment && (
              <>
                <span aria-hidden="true" className="text-text/30">·</span>
                <span>{load.equipment}</span>
              </>
            )}
            {matchCount > 0 && !proven && (
              <span className="rounded-full bg-white/[0.08] px-2 py-px text-[11px] text-text-muted">
                {matchCount} match{matchCount === 1 ? '' : 'es'}
              </span>
            )}
            {Boolean(load.custom_reply_body) && <span className="rounded-full bg-white/[0.08] px-2 py-px text-[11px] text-text">Modified</span>}
            {stopLabel && (
              <span
                title={stops === 'error' ? 'More than one stop, but not how many. Add the stops on the load.' : undefined}
                className={`rounded-full px-2 py-px text-[11px] font-bold tracking-[0.02em] ${stops === 'error' ? 'bg-hot/15 text-hot' : 'bg-white text-black'}`}
              >
                {stopLabel}
              </span>
            )}
          </div>
          {starRun && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold px-2.5 py-[3px] text-[11px] font-bold text-black shadow-[0_0_16px_rgb(var(--color-gold)/0.45)]">
              <StarIcon filled className="h-3 w-3" />
              Your star carrier ran this lane
            </p>
          )}
          {proven && (
            <div className="mt-2.5">
              <Regulars load={load} regulars={regulars} onEmail={onEmail} onOpenCarrier={onOpenCarrier} />
            </div>
          )}
        </div>

        <div className="self-start text-right">
          <p
            className={`flex items-center justify-end gap-1.5 text-[17px] font-semibold tabular-nums tracking-[-0.03em] ${hasNoRate(load) ? 'text-hot' : rateHidden ? 'text-text/35' : 'text-text'}`}
            title={rateHidden ? 'Rate hidden: replies and blasts leave it out' : undefined}
          >
            {onToggleRate ? <RateEye load={load} onToggle={onToggleRate} className="-my-1" /> : rateHidden && <RateHiddenIcon className="h-4 w-4 shrink-0" />}
            <span className={rateHidden ? 'line-through decoration-1' : ''}>{hasNoRate(load) ? 'No rate' : formatMoney(load.target_pay)}</span>
            {rateHidden && <span className="sr-only">, hidden from replies</span>}
          </p>
          {asking > 0 &&
            (onOpenAsking ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenAsking(load);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                title={asking === 1 ? 'Open the email' : 'Open the newest email'}
                className="-mr-1.5 mt-0.5 rounded-full px-1.5 py-px text-[11.5px] font-semibold text-hot underline-offset-2 hover:bg-hot/15 hover:underline focus-visible:bg-hot/15"
              >
                {asking} asking
              </button>
            ) : (
              <p className="mt-0.5 text-[11.5px] font-semibold text-hot">{asking} asking</p>
            ))}
        </div>
      </motion.div>
    </li>
  );
}

export default BoardRow;
