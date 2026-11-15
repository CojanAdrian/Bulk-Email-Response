import { useState } from 'react';
import Sheet, { PILL_DANGER, PILL_PRIMARY, PILL_QUIET } from '../../ui/Sheet';
import CopyText from '../../ui/CopyText';
import { Toggle } from '../../ui/controls';
import LoadPicker from '../../components/LoadPicker';
import { buildPUSched } from '../../lib/datExport';
import { formatMoney } from '../../lib/formatMoney';
import { multiStopTagVariant, detectMultiStop } from '../../lib/lookupMessage';
import { useCarrierCheck } from '../../lib/carrierCheck';
import { CarrierCheckCard } from './CarrierCheck';
import { STATUS_LABELS, senderEmail, senderName, withRateLine, inquiryLoad, matchReason, matchConfidence } from './inquiryText';

function received(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const CONFIDENCE = {
  sure: { label: 'Sure match', tone: 'bg-success/15 text-success' },
  likely: { label: 'Likely match', tone: 'bg-white/[0.1] text-text' },
  check: { label: 'Check this', tone: 'bg-hot/15 text-hot' },
};

// One step of the inquiry, numbered down a thin line: what they wrote,
// which load it is about, what goes back.
function Step({ n, title, last = false, children }) {
  return (
    <section className="relative grid grid-cols-[26px_1fr] gap-x-3.5">
      <div className="flex flex-col items-center">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-white text-[12px] font-bold text-black">{n}</span>
        {!last && <span aria-hidden="true" className="mt-1.5 w-px flex-1 bg-white/[0.12]" />}
      </div>
      <div className={`min-w-0 ${last ? '' : 'pb-6'}`}>
        <h3 className="caps pt-[5px]">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </section>
  );
}

// An inquiry opened from the list, read top to bottom: 1 the carrier's
// email, 2 the load we matched it to and why, 3 the reply. Waiting
// inquiries can be answered, rejected or re-matched here; the rest show
// what was sent.
function InquirySheet({ inquiry, draft, onDraftChange, busy, error, onClose, onSend, onReject, onReassign, onOpenLoad }) {
  const [reassigning, setReassigning] = useState(false);
  const [rateOverride, setRateOverride] = useState(null);
  const waiting = inquiry.reply_status === 'pending_review';
  const hasLoad = Boolean(inquiry.matched_load_id);
  const hasRate = inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined && Number(inquiry.matched_load_target_pay) > 0;
  const rateIncluded = rateOverride ?? Boolean(Number(inquiry.matched_load_include_rate));
  const pickup = buildPUSched(inquiry.matched_load_early_pu, inquiry.matched_load_late_pu);
  const load = inquiryLoad(inquiry);
  const stopTag = multiStopTagVariant(load);
  const stopLabel = detectMultiStop(load);
  const confidence = CONFIDENCE[matchConfidence(inquiry)];
  const check = useCarrierCheck(inquiry);

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
      </p>
      <CarrierCheckCard check={check} />

      <div className="mt-6">
        <Step n={1} title="They wrote">
          <div className="max-w-[92%] rounded-[18px] rounded-tl-[6px] bg-white/[0.07] px-4 py-3">
            <p className="text-[13px] font-semibold text-text">{inquiry.subject || 'No subject'}</p>
            <p className="mt-1 select-text whitespace-pre-wrap text-[13.5px] leading-normal text-text/85">{inquiry.body_snippet || 'No message text was captured.'}</p>
          </div>
          {inquiry.body_snippet && inquiry.body_snippet.length >= 500 && <p className="mt-1.5 text-[11px] text-text-muted">Cut at 500 characters; may include quoted text.</p>}
        </Step>

        <Step n={2} title="About this load">
          <div className="rounded-[18px] border border-white/[0.09] px-4 py-3.5">
            {hasLoad ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => onOpenLoad(inquiry.matched_load_id)} className="text-left text-[17px] font-semibold tracking-[-0.025em] hover:underline">
                    {inquiry.matched_load_origin_city}, {inquiry.matched_load_origin_state}
                    <span className="px-2 text-text/30">→</span>
                    {inquiry.matched_load_dest_city}, {inquiry.matched_load_dest_state}
                  </button>
                  <span className={`shrink-0 rounded-full px-2 py-px text-[11px] font-semibold ${confidence.tone}`}>{confidence.label}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                  <CopyText value={inquiry.matched_load_load_number} label={`Copy load number ${inquiry.matched_load_load_number}`} />
                  {pickup && <span>· PU {pickup}</span>}
                  {inquiry.matched_load_equipment && <span>· {inquiry.matched_load_equipment}</span>}
                  {hasRate && <span>· {formatMoney(inquiry.matched_load_target_pay)}</span>}
                  {stopLabel && (
                    <span className={`rounded-full px-2 py-px text-[11px] font-bold tracking-[0.02em] ${stopTag === 'error' ? 'bg-hot/15 text-hot' : 'bg-white text-black'}`}>{stopLabel}</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-[13px] font-medium text-hot">No load matched.</p>
            )}
            <p className="mt-2 text-[12.5px] text-text-muted">{matchReason(inquiry)}</p>
            {Boolean(inquiry.ref_mismatch) && <p className="mt-1.5 text-[12.5px] font-medium text-hot">They cited a reference number that is not one of your loads. Check it is the right load.</p>}
            {stopTag === 'error' && <p className="mt-1.5 text-[12.5px] font-medium text-hot">More than one stop, but not how many. Add the extra stops on the load so the reply names them.</p>}
            {waiting &&
              (reassigning ? (
                <div className="mt-3 rounded-xl bg-black/30 p-2">
                  <LoadPicker
                    ariaLabel={`Search loads to re-assign the inquiry from ${inquiry.from_address}`}
                    autoFocus
                    onSelect={(picked) => {
                      setReassigning(false);
                      onReassign(picked.id);
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
        </Step>

        <Step n={3} title={waiting ? 'You reply' : 'What was sent'} last>
          {waiting ? (
            <div className="ml-auto max-w-[96%]">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-text-muted" htmlFor={`reply-${inquiry.id}`}>
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
                rows={7}
                placeholder="No load details on file yet. Write a reply."
                className="mt-2 w-full resize-y rounded-[18px] rounded-tr-[6px] border bg-white/[0.04] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text"
              />
              <p className="mt-1.5 text-[11px] text-text-muted">Written from the load's details. Ctrl+Enter sends; your signature is added when it goes out.</p>
            </div>
          ) : inquiry.reply_body ? (
            <p className="ml-auto max-w-[96%] select-text whitespace-pre-wrap rounded-[18px] rounded-tr-[6px] bg-black/30 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text-muted">{inquiry.reply_body}</p>
          ) : (
            <p className="text-[13px] text-text-muted">Nothing was sent.</p>
          )}
        </Step>
      </div>

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
