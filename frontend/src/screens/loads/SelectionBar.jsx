import SelectionCircle from '../../components/SelectionCircle';
import { STATUSES, STATUS_LABELS } from './boardLogic';

const ACTION = 'rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-text transition-[scale,background-color] duration-300 ease-spring hover:bg-white/[0.16] active:scale-95 disabled:pointer-events-none disabled:opacity-40';

// Everything that can be done to the selected loads, in one place right
// above the list. Shift-click a row to select a range; Ctrl+A selects all.
function SelectionBar({ count, total, busy, confirmingDelete, onToggleAll, onStatus, onRate, onAskDelete, onCancelDelete, onDelete, onDone }) {
  const none = count === 0;
  const all = total > 0 && count === total;
  return (
    <div role="toolbar" aria-label="Selected loads" className="mx-3 mt-3 rounded-[20px] bg-white/[0.06] p-3 motion-safe:animate-[rise-in_500ms_var(--spring)_both]">
      <div className="flex items-center gap-2.5">
        <SelectionCircle selected={all} onToggle={onToggleAll} ariaLabel={all ? 'Clear selection' : 'Select all'} />
        <button type="button" onClick={onToggleAll} className="text-[13px] font-semibold text-text">
          {none ? 'Select all' : `${count} of ${total} selected`}
        </button>
        <span className="hidden text-[11.5px] text-text-muted sm:inline">Shift-click for a range</span>
        <button type="button" onClick={onDone} className="ml-auto rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink">
          Done
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {confirmingDelete ? (
          <>
            <span className="mr-1 text-xs text-error">
              Delete {count} load{count === 1 ? '' : 's'}?
            </span>
            <button type="button" onClick={onDelete} disabled={busy} className="rounded-full bg-error px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60">
              {busy ? 'Deleting...' : 'Confirm'}
            </button>
            <button type="button" onClick={onCancelDelete} disabled={busy} className={ACTION}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="caps mr-0.5">Mark</span>
            {STATUSES.map((status) => (
              <button key={status} type="button" onClick={() => onStatus(status)} disabled={none || busy} className={ACTION}>
                {STATUS_LABELS[status]}
              </button>
            ))}
            <span className="caps ml-2 mr-0.5">Rate</span>
            <button type="button" onClick={() => onRate(true)} disabled={none || busy} className={ACTION} aria-label="Include rate in replies">
              Show
            </button>
            <button type="button" onClick={() => onRate(false)} disabled={none || busy} className={ACTION} aria-label="Leave rate out of replies">
              Hide
            </button>
            <button type="button" onClick={onAskDelete} disabled={none || busy} className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-bg disabled:opacity-40">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SelectionBar;
