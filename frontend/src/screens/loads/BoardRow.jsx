import { motion } from 'framer-motion';
import { formatMoney } from '../../lib/formatMoney';
import { multiStopTagVariant } from '../../lib/lookupMessage';
import SelectionCircle from '../../components/SelectionCircle';
import CopyText from '../../ui/CopyText';
import Regulars from './Regulars';
import { hasNoRate, place, schedule } from './boardLogic';

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
function BoardRow({ load, regulars, asking = 0, matchCount = 0, current, selecting, selected, onOpen, onHover, onToggleSelect, onEmail, onOpenCarrier }) {
  const proven = Boolean(regulars?.length);
  const pickup = schedule(load.early_pu, load.late_pu);
  const stops = multiStopTagVariant(load);
  const origin = place(load.origin_city, load.origin_state) || 'Origin missing';
  const dest = place(load.dest_city, load.dest_state) || 'Destination missing';

  function activate() {
    if (selecting) onToggleSelect(load.id);
    else onOpen(load);
  }

  return (
    <li data-testid="load-row" data-row-id={load.id} data-proven={proven ? 'true' : undefined} onPointerEnter={() => onHover(load.id)}>
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
            activate();
          }
        }}
        className={`group relative grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-[18px] px-[18px] py-[13px] outline-none transition-colors duration-200 hover:bg-white/[0.065] focus-visible:bg-white/[0.065] ${
          current || selected ? 'bg-white/[0.065]' : ''
        } [&:hover_.lane-arrow]:w-[30px] [&:hover_.lane-arrow]:text-text`}
      >
        {proven && <span aria-hidden="true" className="absolute bottom-4 left-1.5 top-4 w-0.5 rounded-full bg-gold shadow-[0_0_12px_rgb(var(--color-gold))]" />}

        <span className="flex" onClick={(event) => event.stopPropagation()}>
          {selecting && <SelectionCircle selected={selected} onToggle={() => onToggleSelect(load.id)} ariaLabel={`Select ${load.load_number}`} />}
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
            {stops === 'error' && <span className="rounded-full bg-hot/15 px-2 py-px text-[11px] font-medium text-hot">Needs stops added</span>}
            {stops === 'info' && <span className="rounded-full bg-white/[0.08] px-2 py-px text-[11px] text-text-muted">Stops added</span>}
          </div>
          {proven && (
            <div className="mt-2.5">
              <Regulars load={load} regulars={regulars} onEmail={onEmail} onOpenCarrier={onOpenCarrier} />
            </div>
          )}
        </div>

        <div className="self-start text-right">
          <p className={`text-[17px] font-semibold tabular-nums tracking-[-0.03em] ${hasNoRate(load) ? 'text-hot' : 'text-text'}`}>
            {hasNoRate(load) ? 'No rate' : formatMoney(load.target_pay)}
          </p>
          {asking > 0 && <p className="mt-0.5 text-[11.5px] font-semibold text-hot">{asking} asking</p>}
        </div>
      </motion.div>
    </li>
  );
}

export default BoardRow;
