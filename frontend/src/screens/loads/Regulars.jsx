import { useEffect, useRef, useState } from 'react';
import { getCarrier } from '../../api/carriers';
import { formatMoney } from '../../lib/formatMoney';
import { formatDayAgo } from '../../lib/formatDay';
import Portal from '../../components/Portal';
import CopyText from '../../ui/CopyText';
import { StarIcon } from '../../ui/StarButton';

const CARD_WIDTH = 300;
const CARD_HEIGHT = 330;

// The card that opens from a regular's chip: who they are, what they were
// paid on this lane, and how to reach them.
function RegularCard({ regular, lane, anchor, onClose, onEmail, onOpenCarrier }) {
  const ref = useRef(null);
  const [carrier, setCarrier] = useState(null);

  useEffect(() => {
    let ignore = false;
    getCarrier(regular.carrierId)
      .then((data) => {
        if (!ignore) setCarrier(data);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [regular.carrierId]);

  useEffect(() => {
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - 12));
  const top = Math.max(12, Math.min(anchor.bottom + 10, window.innerHeight - CARD_HEIGHT - 12));

  return (
    <Portal>
      <div
        ref={ref}
        role="dialog"
        aria-label={`${regular.carrierName} on this lane`}
        style={{ left, top, width: CARD_WIDTH }}
        className="mat fixed z-[55] origin-top-left rounded-[26px] p-[18px] text-text motion-safe:animate-[pop-in_500ms_var(--spring)]"
      >
        <p className="caps !text-gold">Ran {lane}</p>
        <h4 className="mt-1.5 text-[19px] font-bold tracking-[-0.035em]">{regular.carrierName}</h4>
        {carrier?.mc_number && <p className="text-xs text-text-muted">MC {carrier.mc_number}</p>}

        <dl className="my-3.5 grid grid-cols-3 gap-2 border-y border-white/[0.07] py-3">
          <div>
            <dt className="caps">Runs</dt>
            <dd className="mt-1 text-[17px] font-semibold tracking-[-0.03em]">{regular.runs}</dd>
          </div>
          <div>
            <dt className="caps">Last paid</dt>
            <dd className="mt-1 text-[17px] font-semibold tracking-[-0.03em]">{formatMoney(regular.lastRate)}</dd>
          </div>
          <div>
            <dt className="caps">Last run</dt>
            <dd className="mt-1 text-[13px] font-semibold leading-[1.6]">{formatDayAgo(regular.lastRanAt)}</dd>
          </div>
        </dl>

        {carrier?.dispatcher_name && <p className="text-[13px] text-text-muted">{carrier.dispatcher_name}, dispatcher</p>}
        {carrier?.dispatcher_phone && (
          <p className="mt-1.5 flex items-center justify-between gap-3 text-base font-semibold tracking-[-0.02em]">
            <span className="select-text">{carrier.dispatcher_phone}</span>
            <CopyText value={carrier.dispatcher_phone} label="Copy phone number" className="mx-0 text-xs font-medium">
              Copy
            </CopyText>
          </p>
        )}
        {carrier && !carrier.dispatcher_phone && !carrier.dispatcher_name && (
          <p className="text-[13px] text-text-muted">No dispatcher contact on file yet.</p>
        )}

        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={() => onEmail(carrier?.dispatcher_email || '')}
            className="flex-1 rounded-full bg-gold py-2.5 text-center text-[12.5px] font-semibold text-black transition-[scale] duration-300 ease-spring active:scale-95"
          >
            Email this load
          </button>
          <button
            type="button"
            onClick={() => onOpenCarrier(regular.carrierId)}
            className="flex-1 rounded-full bg-white/10 py-2.5 text-center text-[12.5px] font-semibold transition-[scale] duration-300 ease-spring active:scale-95"
          >
            Open carrier
          </button>
        </div>
      </div>
    </Portal>
  );
}

const SHOWN = 2;

// The carriers who already ran a load's lane, under a plain caption, as
// chips: name and last rate paid (and how many runs, when more than one).
// The first two show; the rest open with "+ more". Clicking one opens its card.
function Regulars({ load, regulars, onEmail, onOpenCarrier }) {
  const [open, setOpen] = useState(null); // { regular, anchor }
  const [all, setAll] = useState(false);
  if (!regulars?.length) return null;
  const lane = `${load.origin_city} to ${load.dest_city}`;
  const shown = all ? regulars : regulars.slice(0, SHOWN);
  const hidden = regulars.length - shown.length;

  return (
    <>
      {regulars.some((regular) => regular.starred) ? (
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-gold">
          <StarIcon filled className="h-3 w-3" />
          Your star carrier ran this lane
        </p>
      ) : (
        <p className="mb-1.5 text-[11px] font-medium text-gold/80">Ran this lane before</p>
      )}
      <ul aria-label={`Carriers who ran ${load.load_number}'s lane`} className="flex flex-wrap gap-1.5">
        {shown.map((regular) => (
          <li key={regular.carrierId}>
            <button
              type="button"
              aria-label={`${regular.carrierName}, ran this lane ${regular.runs} time${regular.runs === 1 ? '' : 's'}, last paid ${formatMoney(regular.lastRate)}`}
              title="See their contact and email them this load"
              onClick={(event) => {
                event.stopPropagation();
                setOpen({ regular, anchor: event.currentTarget.getBoundingClientRect() });
              }}
              className={`inline-flex max-w-full items-center gap-[7px] rounded-full px-[11px] py-[5px] text-xs transition-[scale,background-color] duration-300 ease-spring hover:scale-105 ${
                regular.starred
                  ? 'bg-gold text-black/70 shadow-[0_0_16px_rgb(var(--color-gold)/0.35)] hover:bg-gold-soft'
                  : 'bg-gold/[0.09] text-text-muted shadow-[inset_0_0_0_0.5px_rgb(var(--color-gold)/0.35)] hover:bg-gold/[0.18]'
              }`}
            >
              {regular.starred && <StarIcon filled className="-ml-0.5 h-3 w-3 shrink-0 text-black" />}
              <b className={`truncate font-semibold ${regular.starred ? 'text-black' : 'text-text'}`}>{regular.carrierName}</b>
              <span className="shrink-0 tabular-nums">
                {formatMoney(regular.lastRate)}
                {regular.runs > 1 ? ` · ${regular.runs} runs` : ''}
              </span>
            </button>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setAll(true);
              }}
              className="rounded-full px-2.5 py-[5px] text-xs font-semibold text-text-muted hover:bg-white/10 hover:text-text"
            >
              + {hidden} more
            </button>
          </li>
        )}
      </ul>
      {open && (
        <RegularCard
          regular={open.regular}
          lane={lane}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          onEmail={(email) => {
            setOpen(null);
            onEmail(load, email);
          }}
          onOpenCarrier={(id) => {
            setOpen(null);
            onOpenCarrier(id);
          }}
        />
      )}
    </>
  );
}

export default Regulars;
