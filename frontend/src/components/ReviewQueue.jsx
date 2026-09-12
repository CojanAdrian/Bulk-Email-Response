import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listInquiries, sendInquiryReply, rejectInquiry, bulkSendInquiries, bulkRejectInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import Badge from './Badge';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';

// live_reply_body is recomposed from the matched load's CURRENT data every
// time inquiries are fetched/pushed (see backend/src/lib/inquiryQueries.js)
// -- preferred over the frozen reply_body snapshot taken when the inquiry
// first arrived, so a load edited after a carrier emailed in (PU/DEL times
// filled in, extra stops added) shows correctly here instead of stale/blank.
function draftTextFor(inquiry) {
  return inquiry.live_reply_body ?? inquiry.reply_body ?? '';
}

function ReviewQueue() {
  const preset = useMotionPreset();
  const [inquiries, setInquiries] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [rateOverrides, setRateOverrides] = useState({});
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
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
    listInquiries('pending_review')
      .then((data) => {
        if (isMountedRef.current) {
          setInquiries(data);
          setDrafts(Object.fromEntries(data.map((inquiry) => [inquiry.id, draftTextFor(inquiry)])));
          setSelectedIds(new Set());
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
      setInquiries((prev) => [inquiry, ...prev]);
      setDrafts((prev) => ({ ...prev, [inquiry.id]: draftTextFor(inquiry) }));
    });
    const unsubscribeUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (inquiry.reply_status === 'pending_review') return;
      setInquiries((prev) => prev.filter((existing) => existing.id !== inquiry.id));
      setSelectedIds((prev) => {
        if (!prev.has(inquiry.id)) return prev;
        const next = new Set(prev);
        next.delete(inquiry.id);
        return next;
      });
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

  function handleReject(id) {
    setError(null);
    setActioningId(id);
    rejectInquiry(id)
      .then(() => {
        if (isMountedRef.current) {
          setInquiries((prev) => prev.filter((inquiry) => inquiry.id !== id));
          setSelectedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
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

  function toggleSelectOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === inquiries.length ? new Set() : new Set(inquiries.map((inquiry) => inquiry.id))));
  }

  function handleBulkSend() {
    setError(null);
    setBulkBusy(true);
    const items = Array.from(selectedIds).map((id) => ({ id, body: drafts[id] }));
    bulkSendInquiries(items)
      .then((res) => {
        if (!isMountedRef.current) return;
        const succeededIds = new Set(res.results.filter((r) => r.ok).map((r) => r.id));
        const failed = res.results.filter((r) => !r.ok);
        setInquiries((prev) => prev.filter((inquiry) => !succeededIds.has(inquiry.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
        if (failed.length > 0) {
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
    const ids = Array.from(selectedIds);
    bulkRejectInquiries(ids)
      .then(() => {
        if (!isMountedRef.current) return;
        setInquiries((prev) => prev.filter((inquiry) => !selectedIds.has(inquiry.id)));
        setSelectedIds(new Set());
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
      <h2 className="mb-3 text-sm font-semibold text-text">Review queue</h2>
      {status === 'loading' && <Skeleton count={2} height="6rem" />}
      {error && (
        <p role="alert" className="mb-3 text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && inquiries.length === 0 && (
        <p className="text-sm text-text-muted">Nothing waiting for review.</p>
      )}
      {status === 'ready' && inquiries.length > 0 && (
        <label className="mb-2 flex items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            aria-label="Select all pending inquiries"
            checked={selectedIds.size > 0 && selectedIds.size === inquiries.length}
            ref={(el) => {
              if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < inquiries.length;
            }}
            onChange={toggleSelectAll}
          />
          Select all
        </label>
      )}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
          <span className="font-medium text-text">{selectedIds.size} selected</span>
          <PrimaryButton onClick={handleBulkSend} disabled={bulkBusy} className="px-3 py-1 text-xs">
            {bulkBusy ? 'Sending...' : `Send ${selectedIds.size}`}
          </PrimaryButton>
          {confirmingBulkReject ? (
            <>
              <span className="text-xs text-error">Reject {selectedIds.size}?</span>
              <button
                onClick={handleBulkReject}
                disabled={bulkBusy}
                className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
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
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
            className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
          >
            Clear selection
          </button>
        </div>
      )}
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
              return (
              <motion.li
                key={inquiry.id}
                layout
                {...preset.popIn}
                transition={{ ...preset.popIn.transition, delay: index * preset.stagger }}
                className="rounded-xl border border-border bg-surface-alt p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    aria-label={`Select inquiry from ${inquiry.from_address}`}
                    checked={selectedIds.has(inquiry.id)}
                    onChange={() => toggleSelectOne(inquiry.id)}
                  />
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
                  {Boolean(inquiry.ref_mismatch) && (
                    <Badge variant="warning">Different load? — reference # didn't match, verify</Badge>
                  )}
                  {multiStopVariant === 'error' && (
                    <Badge variant="error">{multiStopFlag} — add extra stops manually</Badge>
                  )}
                  {multiStopVariant === 'info' && <Badge variant="info">Extra stops already added</Badge>}
                </div>
                {inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined && (
                  <label className="mb-2 flex items-center gap-2 text-xs text-text-muted" htmlFor={`rate-toggle-${inquiry.id}`}>
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
                  rows={5}
                  placeholder="No load details on file yet — write a reply below."
                  className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
                />
                <div className="flex justify-end gap-2">
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
