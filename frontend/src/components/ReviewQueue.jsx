import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listInquiries, sendInquiryReply, rejectInquiry, reassignInquiry, bulkSendInquiries, bulkRejectInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
import { buildPUSched } from '../lib/datExport';
import { useMotionPreset } from '../lib/motionConfig';
import { useSelectionMode } from '../lib/useSelectionMode';
import Badge from './Badge';
import BottomActionBar from './BottomActionBar';
import Card from './Card';
import LoadPicker from './LoadPicker';
import RelativeTime from './RelativeTime';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';
import SelectionCircle from './SelectionCircle';

// live_reply_body is recomposed from the matched load's CURRENT data every
// time inquiries are fetched/pushed (see backend/src/lib/inquiryQueries.js)
// -- preferred over the frozen reply_body snapshot taken when the inquiry
// first arrived, so a load edited after a carrier emailed in (PU/DEL times
// filled in, extra stops added) shows correctly here instead of stale/blank.
function draftTextFor(inquiry) {
  return inquiry.live_reply_body ?? inquiry.reply_body ?? '';
}

const MATCH_TIER_LABELS = {
  load_number: 'Load #', city_state: 'City + state', city: 'City', state: 'State', manual: 'Manually matched', none: 'No match',
};

// The matched load's number, lane, PU window, equipment, and target pay
// -- shown on every card so a match can be verified at a glance instead
// of being trusted blind or looked up in another tab.
function MatchedLoadHeader({ inquiry }) {
  if (!inquiry.matched_load_id) {
    return (
      <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-muted">
        No load matched — pick one below if you can tell which load this is about.
      </p>
    );
  }
  const lane = inquiry.matched_load_origin_city && inquiry.matched_load_dest_city
    ? `${inquiry.matched_load_origin_city}, ${inquiry.matched_load_origin_state} → ${inquiry.matched_load_dest_city}, ${inquiry.matched_load_dest_state}`
    : 'No lane on file';
  const puWindow = buildPUSched(inquiry.matched_load_early_pu, inquiry.matched_load_late_pu);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2 text-xs text-text-muted">
      <span className="font-semibold text-text">Load {inquiry.matched_load_load_number}</span>
      <span>{lane}</span>
      {puWindow && <span>PU {puWindow}</span>}
      {inquiry.matched_load_equipment && <span>{inquiry.matched_load_equipment}</span>}
      {inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined && (
        <span>${Number(inquiry.matched_load_target_pay).toLocaleString()}</span>
      )}
      <Badge variant="default">{MATCH_TIER_LABELS[inquiry.match_tier] || inquiry.match_tier}</Badge>
    </div>
  );
}

// The carrier's own message, shown above the reply draft -- previously
// stored (body_snippet) and never displayed anywhere, so every reply was
// approved having seen a sender address and a subject line but never the
// actual question being answered.
function InquiryMessage({ bodySnippet }) {
  return (
    <div className="mb-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Their message</p>
      <p className="whitespace-pre-wrap">{bodySnippet || 'No message text captured for this inquiry.'}</p>
      {bodySnippet && bodySnippet.length >= 500 && (
        <p className="mt-1 text-[10px] text-text-muted">May be truncated at 500 characters, and can include quoted reply text.</p>
      )}
    </div>
  );
}

function ReviewQueue() {
  const preset = useMotionPreset();
  const [inquiries, setInquiries] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [rateOverrides, setRateOverrides] = useState({});
  const selection = useSelectionMode();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
  const [reassigningId, setReassigningId] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Reset on every mount -- see GmailConnectionPanel.jsx for why this
    // matters under React 18 StrictMode's dev-only double-mount.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function fetchQueue() {
    setStatus('loading');
    setError(null);
    listInquiries('pending_review', { order: 'oldest' })
      .then((data) => {
        if (isMountedRef.current) {
          setInquiries(data);
          setDrafts(Object.fromEntries(data.map((inquiry) => [inquiry.id, draftTextFor(inquiry)])));
          selection.exit();
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load the review queue.');
          setStatus('error');
        }
      });
  }

  useEffect(() => {
    fetchQueue();
  }, []);

  useEffect(() => {
    const unsubscribeNew = subscribe('inquiry:new', (inquiry) => {
      if (inquiry.reply_status !== 'pending_review') return;
      // Appended, not prepended -- a newly-arrived inquiry is by
      // definition the newest one, and this queue sorts oldest-first so
      // the most overdue inquiry stays at the top.
      setInquiries((prev) => [...prev, inquiry]);
      setDrafts((prev) => ({ ...prev, [inquiry.id]: draftTextFor(inquiry) }));
    });
    const unsubscribeUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (inquiry.reply_status === 'pending_review') return;
      setInquiries((prev) => prev.filter((existing) => existing.id !== inquiry.id));
      selection.remove(inquiry.id);
    });
    return () => {
      unsubscribeNew();
      unsubscribeUpdated();
    };
  }, []);

  function handleDraftChange(id, value) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  // Ctrl/Cmd+Enter sends straight from the textarea -- the common case is
  // reading the draft, maybe tweaking a word, then sending, and reaching for
  // the mouse for that last step is the slow part.
  function handleTextareaKeyDown(e, id) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (actioningId !== id) handleSend(id);
    }
  }

  function isRateIncluded(inquiry) {
    if (inquiry.id in rateOverrides) return rateOverrides[inquiry.id];
    return Boolean(Number(inquiry.matched_load_include_rate));
  }

  function handleRateToggle(inquiry, checked) {
    setRateOverrides((prev) => ({ ...prev, [inquiry.id]: checked }));
    const targetPay = Number(inquiry.matched_load_target_pay);
    const rateLine = `Rate: $${targetPay.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    setDrafts((prev) => {
      const current = prev[inquiry.id] ?? '';
      const withoutRate = current.split('\n').filter((line) => !line.startsWith('Rate: ')).join('\n');
      const next = checked ? (withoutRate ? `${withoutRate}\n${rateLine}` : rateLine) : withoutRate;
      return { ...prev, [inquiry.id]: next };
    });
  }

  function handleSend(id) {
    setError(null);
    setActioningId(id);
    sendInquiryReply(id, drafts[id])
      .then(() => {
        if (isMountedRef.current) {
          setInquiries((prev) => prev.filter((inquiry) => inquiry.id !== id));
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to send the reply.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setActioningId(null);
        }
      });
  }

  function handleReassign(inquiryId, loadId) {
    setError(null);
    reassignInquiry(inquiryId, loadId)
      .then((updated) => {
        if (!isMountedRef.current) return;
        setInquiries((prev) => prev.map((inquiry) => (inquiry.id === inquiryId ? updated : inquiry)));
        setDrafts((prev) => ({ ...prev, [inquiryId]: draftTextFor(updated) }));
        setReassigningId(null);
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to change the matched load.');
        }
      });
  }

  function handleReject(id) {
    setError(null);
    setActioningId(id);
    rejectInquiry(id)
      .then(() => {
        if (isMountedRef.current) {
          setInquiries((prev) => prev.filter((inquiry) => inquiry.id !== id));
          selection.remove(id);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to reject the inquiry.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setActioningId(null);
        }
      });
  }

  function handleBulkSend() {
    setError(null);
    setBulkBusy(true);
    const items = Array.from(selection.selectedIds).map((id) => ({ id, body: drafts[id] }));
    bulkSendInquiries(items)
      .then((res) => {
        if (!isMountedRef.current) return;
        const succeededIds = res.results.filter((r) => r.ok).map((r) => r.id);
        const failed = res.results.filter((r) => !r.ok);
        setInquiries((prev) => prev.filter((inquiry) => !succeededIds.includes(inquiry.id)));
        if (failed.length === 0) {
          selection.exit();
        } else {
          succeededIds.forEach((id) => selection.remove(id));
          setError(`${failed.length} of ${res.results.length} selected replies could not be sent: ${failed.map((f) => f.error).join('; ')}`);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to send the selected replies.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setBulkBusy(false);
        }
      });
  }

  function handleBulkReject() {
    setError(null);
    setBulkBusy(true);
    const ids = Array.from(selection.selectedIds);
    bulkRejectInquiries(ids)
      .then(() => {
        if (!isMountedRef.current) return;
        setInquiries((prev) => prev.filter((inquiry) => !ids.includes(inquiry.id)));
        selection.exit();
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to reject the selected inquiries.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setBulkBusy(false);
          setConfirmingBulkReject(false);
        }
      });
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Review queue</h2>
        {status === 'ready' && inquiries.length > 0 && (
          selection.active ? (
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => selection.selectAll(inquiries.map((inquiry) => inquiry.id))}
                className="rounded-lg border border-border bg-surface px-3 py-1 text-text hover:bg-surface-alt"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={selection.exit}
                className="rounded-lg border border-border bg-surface px-3 py-1 text-text hover:bg-surface-alt"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={selection.enter}
              className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-text hover:bg-surface-alt"
            >
              Select
            </button>
          )
        )}
      </div>
      {status === 'loading' && <Skeleton count={2} height="6rem" />}
      {error && (
        <p role="alert" className="mb-3 text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && inquiries.length === 0 && (
        <p className="text-sm text-text-muted">Nothing waiting for review.</p>
      )}
      <BottomActionBar count={selection.selectedIds.size}>
        <PrimaryButton onClick={handleBulkSend} disabled={bulkBusy} className="px-3 py-1 text-xs">
          {bulkBusy ? 'Sending...' : `Send ${selection.selectedIds.size}`}
        </PrimaryButton>
        {confirmingBulkReject ? (
          <>
            <span className="text-xs text-error">Reject {selection.selectedIds.size}?</span>
            <button
              onClick={handleBulkReject}
              disabled={bulkBusy}
              className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-surface hover:opacity-90 disabled:opacity-60"
            >
              {bulkBusy ? 'Rejecting...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmingBulkReject(false)}
              disabled={bulkBusy}
              className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingBulkReject(true)}
            disabled={bulkBusy}
            className="rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg disabled:opacity-60"
          >
            Reject selected
          </button>
        )}
        <button
          onClick={selection.clear}
          disabled={bulkBusy}
          className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
        >
          Clear selection
        </button>
      </BottomActionBar>
      {status === 'ready' && inquiries.length > 0 && (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {inquiries.map((inquiry, index) => {
              const multiStopFlag = detectMultiStop({
                comment: inquiry.matched_load_comment,
                stops: inquiry.matched_load_stops,
              });
              const multiStopVariant = multiStopTagVariant({
                comment: inquiry.matched_load_comment,
                stops: inquiry.matched_load_stops,
                extra_stops: inquiry.matched_load_extra_stops,
              });
              const selected = selection.isSelected(inquiry.id);
              return (
              <motion.li
                key={inquiry.id}
                layout
                {...preset.popIn}
                transition={{ ...preset.popIn.transition, delay: index * preset.stagger }}
                onClick={() => {
                  if (selection.active) selection.toggle(inquiry.id);
                }}
                className={`rounded-xl border p-4 transition-colors ${
                  selection.active
                    ? selected
                      ? 'cursor-pointer border-accent bg-accent/10'
                      : 'cursor-pointer border-border bg-surface-alt hover:bg-border/30'
                    : 'border-border bg-surface-alt'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-text">
                  {selection.active && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <SelectionCircle
                        selected={selected}
                        onToggle={() => selection.toggle(inquiry.id)}
                        ariaLabel={`Select inquiry from ${inquiry.from_address}`}
                      />
                    </div>
                  )}
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
                  <RelativeTime value={inquiry.received_at} className="text-xs" />
                  {Boolean(inquiry.ref_mismatch) && (
                    <Badge variant="warning">Different load? — reference # didn't match, verify</Badge>
                  )}
                  {multiStopVariant === 'error' && (
                    <Badge variant="error">{multiStopFlag} — add extra stops manually</Badge>
                  )}
                  {multiStopVariant === 'info' && <Badge variant="info">Extra stops already added</Badge>}
                </div>
                <MatchedLoadHeader inquiry={inquiry} />
                <InquiryMessage bodySnippet={inquiry.body_snippet} />
                <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                  {reassigningId === inquiry.id ? (
                    <div className="rounded-lg border border-border p-2">
                      <LoadPicker
                        ariaLabel={`Search loads to re-assign the inquiry from ${inquiry.from_address}`}
                        autoFocus
                        onSelect={(load) => handleReassign(inquiry.id, load.id)}
                      />
                      <button
                        type="button"
                        onClick={() => setReassigningId(null)}
                        className="mt-2 text-xs text-text-muted hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReassigningId(inquiry.id)}
                      className="text-xs font-semibold text-info underline-offset-2 hover:underline"
                    >
                      Wrong load? Change match
                    </button>
                  )}
                </div>
                {inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined && (
                  <label
                    className="mb-2 flex items-center gap-2 text-xs text-text-muted"
                    htmlFor={`rate-toggle-${inquiry.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      id={`rate-toggle-${inquiry.id}`}
                      type="checkbox"
                      checked={isRateIncluded(inquiry)}
                      onChange={(e) => handleRateToggle(inquiry, e.target.checked)}
                    />
                    Include rate on send
                  </label>
                )}
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`reply-${inquiry.id}`}>
                  Reply
                </label>
                <textarea
                  id={`reply-${inquiry.id}`}
                  value={drafts[inquiry.id] ?? ''}
                  onChange={(e) => handleDraftChange(inquiry.id, e.target.value)}
                  onKeyDown={(e) => handleTextareaKeyDown(e, inquiry.id)}
                  onClick={(e) => e.stopPropagation()}
                  rows={5}
                  placeholder="No load details on file yet — write a reply below."
                  className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
                />
                <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <SecondaryButton onClick={() => handleReject(inquiry.id)} disabled={actioningId === inquiry.id}>
                    Reject
                  </SecondaryButton>
                  <PrimaryButton onClick={() => handleSend(inquiry.id)} disabled={actioningId === inquiry.id}>
                    {actioningId === inquiry.id ? 'Sending...' : 'Send'}
                  </PrimaryButton>
                </div>
              </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

export default ReviewQueue;
