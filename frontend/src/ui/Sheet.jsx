import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

export const SHEET_SPRING = { type: 'spring', stiffness: 260, damping: 28 };

const WIDTHS = { md: 'md:w-[620px]', lg: 'md:w-[720px]' };

// Escape closes the sheet unless another dialog is open on top of it.
function useEscape(onClose) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-sheet])')) return;
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
}

export function CloseButton({ onClose }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute right-5 top-5 z-10 grid h-[30px] w-[30px] place-items-center rounded-full bg-white/10 transition-[rotate,background-color] duration-500 ease-spring hover:rotate-90 hover:bg-white/20"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  );
}

// Opened from Ctrl K search or an alert (not by clicking its row): the row
// may be far down a list, or not drawn yet, and growing out of it left the
// sheet stuck off screen behind the dark veil. Those pop in instead.
export const FROM_ELSEWHERE = { fromSearch: true };
export function useRowLayoutId(layoutId) {
  const { state } = useLocation();
  return state?.fromSearch ? undefined : layoutId;
}

// A detail sheet over the left side of the screen. Give it the layoutId of
// the row it came from and it grows out of that row.
function Sheet({ layoutId: rowLayoutId, label, onClose, width = 'md', children }) {
  useEscape(onClose);
  const layoutId = useRowLayoutId(rowLayoutId);
  return (
    <motion.div
      layoutId={layoutId}
      transition={SHEET_SPRING}
      initial={layoutId ? undefined : { opacity: 0, scale: 0.94, y: 20 }}
      animate={layoutId ? undefined : { opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-sheet
      className={`mat fixed inset-x-3 bottom-[88px] top-[76px] z-[35] m-auto flex h-fit max-h-[calc(100dvh-164px)] flex-col overflow-hidden rounded-[34px] text-text md:inset-x-auto md:bottom-[104px] md:left-[52px] md:top-[84px] md:max-h-[calc(100dvh-188px)] ${WIDTHS[width]}`}
    >
      <CloseButton onClose={onClose} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.35 } }} className="flex min-h-0 flex-col overflow-y-auto px-8 pb-6 pt-7 [scrollbar-width:none]">
        {children}
      </motion.div>
    </motion.div>
  );
}

export default Sheet;

// The dark veil behind an open sheet; clicking it closes the sheet.
export function SheetBackdrop({ onClose }) {
  return <div className="fixed inset-0 z-[34] bg-black/20" onClick={onClose} aria-hidden="true" />;
}

export const PILL = 'rounded-full px-5 py-3 text-[13px] font-semibold transition-[scale,background-color] duration-300 ease-spring active:scale-95 disabled:opacity-50';
export const PILL_PRIMARY = `${PILL} bg-accent text-accent-ink`;
export const PILL_QUIET = `${PILL} bg-white/10 text-text hover:bg-white/[0.18]`;
export const PILL_DANGER = `${PILL} bg-transparent text-error hover:bg-error-bg`;

// A label above a value, as in the sheets' fact rows.
export function Fact({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="caps">{label}</dt>
      <dd className="mt-1.5 truncate text-[20px] font-semibold tracking-[-0.035em] text-text">{children}</dd>
    </div>
  );
}
