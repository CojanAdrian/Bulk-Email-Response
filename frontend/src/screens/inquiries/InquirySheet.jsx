import { useState } from 'react';
import Sheet, { PILL_DANGER, PILL_PRIMARY, PILL_QUIET } from '../../ui/Sheet';
import CopyText from '../../ui/CopyText';
import { Toggle } from '../../ui/controls';
import LoadPicker from '../../components/LoadPicker';
import { buildPUSched } from '../../lib/datExport';
import { formatMoney } from '../../lib/formatMoney';
import { multiStopTagVariant, detectMultiStop } from '../../lib/lookupMessage';
import { STATUS_LABELS, TIER_LABELS, senderEmail, senderName, withRateLine } from './inquiryText';

function received(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// An inquiry opened from the list: the carrier's message, the load it was
// matched to, and the reply. Waiting inquiries can be answered, rejected or
// re-matched here; the rest show what was sent.
function InquirySheet({ inquiry, draft, onDraftChange, busy, error, onClose, onSend, onReject, onReassign, onOpenLoad }) {
  const [reassigning, setReassigning] = useState(false);
  const [rateOverride, setRateOverride] = useState(null);
  const waiting = inquiry.reply_status === 'pending_review';
  const hasLoad = Boolean(inquiry.matched_load_id);
  const hasRate = inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined;
  const rateIncluded = rateOverride ?? Boolean(Number(inquiry.matched_load_include_rate));
  const pickup = buildPUSched(inquiry.matched_load_early_pu, inquiry.matched_load_late_pu);
  const stopTag = multiStopTagVariant({ comment: inquiry.matched_load_comment, stops: inquiry.matched_load_stops, extra_stops: inquiry.matched_load_extra_stops });
  const stopFlag = detectMultiStop({ comment: inquiry.matched_load_comment, stops: inquiry.matched_load_stops });

  function toggleRate(include) {
    setRateOverride(include);
    onDraftChange(withRateLine(draft, include, inquiry.matched_load_target_pay));
  }

  return (
    <Sheet layoutId={`inquiry-${inquiry.id}`} label={`Inquiry from ${inquiry.from_address}`} onClose={onClose} width="lg">
      <p className="caps flex flex-wrap items-center gap-x-2 pr-10">
        <span>{received(inquiry.received_at)}</span>
        <span aria-hidden="true">·</span>
        <span className={waiting ? 'text-hot' : ''}>{STATUS_LABELS[inquiry.reply_status] || inquiry.reply_status}</span>
      </p>
      <h2 className="mt-3 text-[34px] font-bold leading-none tracking-[-0.05em]">{senderName(inquiry.from_address)}</h2>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
        <CopyText value={senderEmail(inquiry.from_address)} label="Copy email address" className="mx-0" />
        <span aria-hidden="true">·</span>
        <span className="truncate">{inquiry.subject || 'No subject'}</span>
      </p>

      <div className="mt-5 rounded-[18px] bg-white/[0.055] px-4 py-3.5">
        <p className="caps">Their message</p>
        <p className="mt-1.5 select-text whitespace-pre-wrap text-[13.5px] leading-normal text-text">{inquiry.body_snippet || 'No message text was captured.'}</p>
        {inquiry.body_snippet && inquiry.body_snippet.length >= 500 && <p className="mt-1.5 text-[11px] text-text-muted">Cut at 500 characters; may include quoted text.</p>}
      </div>

      <div className="mt-3 rounded-[18px] bg-white/[0.055] px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="caps">Matched load</p>
          <span className="rounded-full bg-white/[0.08] px-2 py-px text-[11px] text-text-muted">{TIER_LABELS[inquiry.match_tier] || inquiry.match_tier}</span>
        </div>
        {hasLoad ? (
          <>
            <button type="button" onClick={() => onOpenLoad(inquiry.matched_load_id)} className="mt-1.5 text-left text-[17px] font-semibold tracking-[-0.025em] hover:underline">
              {inquiry.matched_load_origin_city}, {inquiry.matched_load_origin_state}
              <span className="px-2 text-text/30">→</span>
              {inquiry.matched_load_dest_city}, {inquiry.matched_load_dest_state}
            </button>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
              <CopyText value={inquiry.matched_load_load_number} label={`Copy load number ${inquiry.matched_load_load_number}`} />
              {pickup && <span>· PU {pickup}</span>}
              {inquiry.matched_load_equipment && <span>· {inquiry.matched_load_equipment}</span>}
              {hasRate && <span>· {formatMoney(inquiry.matched_load_target_pay)}</span>}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] text-text-muted">No load matched. Pick one if you can tell which load this is about.</p>
        )}
        {Boolean(inquiry.ref_mismatch) && <p className="mt-2 text-[12.5px] font-medium text-hot">They cited a reference number that is not one of your loads. Check it is the right load.</p>}
        {stopTag === 'error' && <p className="mt-2 text-[12.5px] font-medium text-hot">{stopFlag}. Add the extra stops to the reply.</p>}
        {stopTag === 'info' && <p className="mt-2 text-[12.5px] text-text-muted">Extra stops are already in the reply.</p>}
        {waiting &&
          (reassigning ? (
            <div className="mt-3 rounded-xl bg-black/30 p-2">
              <LoadPicker
                ariaLabel={`Search loads to re-assign the inquiry from ${inquiry.from_address}`}
                autoFocus
                onSelect={(load) => {
                  setReassigning(false);
                  onReassign(load.id);
                }}
              />
              <button type="button" onClick={() => setReassigning(false)} className="mt-2 text-xs text-text-muted hover:text-text">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setReassigning(true)} className="mt-2.5 text-xs font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline">
              {hasLoad ? 'Wrong load? Change match' : 'Pick the load'}
            </button>
          ))}
      </div>

      {waiting ? (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="caps" htmlFor={`reply-${inquiry.id}`}>
              Reply
            </label>
            {hasRate && (
              <span className="flex items-center gap-2 text-xs text-text-muted">
                Include rate
                <Toggle checked={rateIncluded} onChange={toggleRate} label="Include rate on send" />
              </span>
            )}
          </div>
          <textarea
            id={`reply-${inquiry.id}`}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (!busy) onSend();
              }
            }}
            rows={6}
            placeholder="No load details on file yet. Write a reply."
            className="mt-2 w-full resize-y rounded-[16px] border px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text"
          />
          <p className="mt-1.5 text-[11px] text-text-muted">Ctrl+Enter sends. Your signature is added when it goes out.</p>
        </>
      ) : (
        inquiry.reply_body && (
          <div className="mt-4">
            <p className="caps">What was sent</p>
            <p className="mt-1.5 select-text whitespace-pre-wrap rounded-[16px] bg-black/30 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text-muted">{inquiry.reply_body}</p>
          </div>
        )
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {waiting && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onSend} disabled={busy} className={PILL_PRIMARY}>
            {busy ? 'Sending...' : 'Send reply'}
          </button>
          {hasLoad && (
            <button type="button" onClick={() => onOpenLoad(inquiry.matched_load_id)} className={PILL_QUIET}>
              Open load
            </button>
          )}
          <button type="button" onClick={onReject} disabled={busy} className={`${PILL_DANGER} ml-auto`}>
            Reject
          </button>
        </div>
      )}
    </Sheet>
  );
}

export default InquirySheet;
