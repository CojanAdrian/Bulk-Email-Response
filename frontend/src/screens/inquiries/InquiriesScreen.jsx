import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { sendInquiryReply, rejectInquiry, reassignInquiry, bulkSendInquiries, bulkRejectInquiries } from '../../api/inquiries';
import { useSelectionMode } from '../../lib/useSelectionMode';
import { useHotkeys } from '../../lib/useHotkeys';
import { useScreenMap, laneFromRow } from '../../map/useScreenMap';
import BottomActionBar from '../../components/BottomActionBar';
import Skeleton from '../../components/Skeleton';
import ScreenPanel, { PanelTabs, PanelSearch, TOOL_BUTTON, EmptyNote } from '../../ui/ScreenPanel';
import { SheetBackdrop } from '../../ui/Sheet';
import TodayCard from '../../shell/TodayCard';
import InquiryRow from './InquiryRow';
import InquirySheet from './InquirySheet';
import InboxCard from './InboxCard';
import { useInquiries } from './useInquiries';
import { draftFor, matchesSearch } from './inquiryText';

function openIdFrom(pathname) {
  const match = pathname.match(/^\/inquiries\/(\d+)/);
  return match ? Number(match[1]) : null;
}

// Carrier emails about your loads. Waiting ones are oldest first, so the
// one that has waited longest is on top; All is everything, newest first.
function InquiriesScreen({ refreshKey }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { all, queue, status, error, replace } = useInquiries(refreshKey);
  const [tab, setTab] = useState('waiting');
  const [query, setQuery] = useState('');
  const [currentId, setCurrentId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const selection = useSelectionMode();
  const listRef = useRef(null);

  const source = tab === 'waiting' ? queue : all;
  const rows = useMemo(() => source.filter((inquiry) => matchesSearch(inquiry, query.trim().toLowerCase())), [source, query]);
  const openId = openIdFrom(location.pathname);
  const open = openId === null ? null : all.find((inquiry) => inquiry.id === openId) || null;
  const current = rows.find((inquiry) => inquiry.id === currentId) || null;

  // One lane per load, however many emails are about it.
  const lanes = useMemo(() => {
    const byLoad = new Map();
    for (const inquiry of rows) {
      if (!inquiry.matched_load_id || byLoad.has(inquiry.matched_load_id)) continue;
      const lane = laneFromRow(inquiry.matched_load_id, inquiry, { prefix: 'matched_load_' });
      if (lane) byLoad.set(inquiry.matched_load_id, lane);
    }
    return [...byLoad.values()];
  }, [rows]);
  const focusInquiry = open || current;
  const { widest } = useScreenMap({ lanes, focusId: focusInquiry?.matched_load_id ?? null, rightColumn: true, sheetOpen: Boolean(open) });

  const draftOf = useCallback((inquiry) => drafts[inquiry.id] ?? draftFor(inquiry), [drafts]);

  useEffect(() => {
    setActionError(null);
  }, [openId]);

  function openInquiry(inquiry) {
    navigate(`/inquiries/${inquiry.id}`);
  }
  function close() {
    navigate('/inquiries');
  }

  // After an answer, the next waiting inquiry opens, so a queue can be
  // worked through without going back to the list.
  function advance(fromId) {
    const index = queue.findIndex((inquiry) => inquiry.id === fromId);
    const next = queue[index + 1] || queue[index - 1];
    if (next && next.id !== fromId) navigate(`/inquiries/${next.id}`, { replace: true });
    else close();
  }

  function send(inquiry) {
    setBusyId(inquiry.id);
    setActionError(null);
    sendInquiryReply(inquiry.id, draftOf(inquiry))
      .then((updated) => {
        replace(updated || { id: inquiry.id, reply_status: 'sent' });
        advance(inquiry.id);
      })
      .catch((err) => setActionError(err.message || 'Failed to send the reply.'))
      .finally(() => setBusyId(null));
  }

  function reject(inquiry) {
    setBusyId(inquiry.id);
    setActionError(null);
    rejectInquiry(inquiry.id)
      .then((updated) => {
        replace(updated || { id: inquiry.id, reply_status: 'rejected' });
        advance(inquiry.id);
      })
      .catch((err) => setActionError(err.message || 'Failed to reject the inquiry.'))
      .finally(() => setBusyId(null));
  }

  function reassign(inquiry, loadId) {
    setActionError(null);
    reassignInquiry(inquiry.id, loadId)
      .then((updated) => {
        replace(updated);
        setDrafts((prev) => ({ ...prev, [inquiry.id]: draftFor(updated) }));
      })
      .catch((err) => setActionError(err.message || 'Failed to change the matched load.'));
  }

  function bulkSend() {
    setBulkBusy(true);
    setActionError(null);
    const ids = Array.from(selection.selectedIds);
    const byId = new Map(queue.map((inquiry) => [inquiry.id, inquiry]));
    bulkSendInquiries(ids.map((id) => ({ id, body: byId.has(id) ? draftOf(byId.get(id)) : undefined })))
      .then((res) => {
        const results = res?.results || [];
        results.filter((r) => r.ok).forEach((r) => replace(r.inquiry || { id: r.id, reply_status: 'sent' }));
        const failed = results.filter((r) => !r.ok);
        if (failed.length) setActionError(`${failed.length} of ${results.length} replies could not be sent: ${failed.map((f) => f.error).join('; ')}`);
        else selection.exit();
      })
      .catch((err) => setActionError(err.message || 'Failed to send the selected replies.'))
      .finally(() => setBulkBusy(false));
  }

  function bulkReject() {
    setBulkBusy(true);
    setActionError(null);
    const ids = Array.from(selection.selectedIds);
    bulkRejectInquiries(ids)
      .then(() => {
        ids.forEach((id) => replace({ id, reply_status: 'rejected' }));
        selection.exit();
        setConfirmingReject(false);
      })
      .catch((err) => setActionError(err.message || 'Failed to reject the selected inquiries.'))
      .finally(() => setBulkBusy(false));
  }

  function move(step) {
    if (rows.length === 0) return;
    const index = rows.findIndex((inquiry) => inquiry.id === currentId);
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + step))] || rows[0];
    setCurrentId(next.id);
    listRef.current?.querySelector(`[data-row-id="${next.id}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }

  useHotkeys({
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Enter: () => current && openInquiry(current),
  });

  return (
    <>
      <ScreenPanel
        ref={listRef}
        label="Inquiries"
        count={queue.length}
        caption="Inbox"
        title={queue.length === 1 ? 'needs a reply' : 'need a reply'}
        pushedBack={Boolean(open)}
        onPointerLeave={() => setCurrentId(null)}
        tabs={
          <>
            <PanelTabs
              label="Show inquiries"
              value={tab}
              onChange={(next) => {
                setTab(next);
                selection.exit();
              }}
              options={[
                { value: 'waiting', label: 'Waiting', count: queue.length },
                { value: 'all', label: 'All', count: all.length },
              ]}
            />
            {tab === 'waiting' && queue.length > 0 && (
              <div className="ml-auto flex pb-2">
                {selection.active && (
                  <button type="button" onClick={() => selection.selectAll(rows.map((inquiry) => inquiry.id))} className={TOOL_BUTTON}>
                    Select all
                  </button>
                )}
                <button type="button" onClick={selection.active ? selection.exit : selection.enter} className={TOOL_BUTTON}>
                  {selection.active ? 'Done' : 'Select'}
                </button>
              </div>
            )}
          </>
        }
        toolbar={<PanelSearch label="Search inquiries" placeholder="Search sender, subject, load #" value={query} onChange={setQuery} />}
        footer={
          <BottomActionBar count={selection.selectedIds.size}>
            <button type="button" onClick={bulkSend} disabled={bulkBusy} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-60">
              {bulkBusy ? 'Sending...' : `Send ${selection.selectedIds.size}`}
            </button>
            {confirmingReject ? (
              <>
                <span className="text-xs text-error">Reject {selection.selectedIds.size}?</span>
                <button type="button" onClick={bulkReject} disabled={bulkBusy} className="rounded-full bg-error px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60">
                  Confirm
                </button>
                <button type="button" onClick={() => setConfirmingReject(false)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingReject(true)} disabled={bulkBusy} className="rounded-full px-3 py-1.5 text-xs text-error hover:bg-error-bg">
                Reject selected
              </button>
            )}
            <button type="button" onClick={selection.clear} className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-xs">
              Clear selection
            </button>
          </BottomActionBar>
        }
      >
        {status === 'loading' && (
          <div className="px-2 pt-2">
            <Skeleton count={5} height="4.4rem" className="rounded-[18px]" />
          </div>
        )}
        {status === 'error' && (
          <p role="alert" className="px-4 py-6 text-sm text-error">
            {error}
          </p>
        )}
        {actionError && !open && (
          <p role="alert" className="mx-2 mb-2 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
            {actionError}
          </p>
        )}
        {status === 'ready' && source.length === 0 && (
          <EmptyNote title={tab === 'waiting' ? 'Nothing waiting for you.' : 'No inquiries yet.'}>
            {tab === 'waiting' ? 'New carrier emails about your loads land here, matched and ready to answer.' : 'Connect Gmail and carrier emails about your loads show up here.'}
          </EmptyNote>
        )}
        {status === 'ready' && source.length > 0 && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-text-muted">No inquiries match "{query}".</p>}
        {rows.length > 0 && (
          <ul aria-label="Inquiries">
            {rows.map((inquiry) => (
              <InquiryRow
                key={inquiry.id}
                inquiry={inquiry}
                showStatus={tab === 'all'}
                current={currentId === inquiry.id}
                selecting={selection.active}
                selected={selection.isSelected(inquiry.id)}
                onOpen={openInquiry}
                onHover={(item) => setCurrentId(item.id)}
                onToggleSelect={selection.toggle}
              />
            ))}
          </ul>
        )}
      </ScreenPanel>

      {widest && (
        <aside className="fixed right-9 top-24 z-[9] w-[300px] space-y-3">
          <InboxCard />
          <TodayCard />
        </aside>
      )}

      {open && <SheetBackdrop onClose={close} />}
      <AnimatePresence>
        {open && (
          <InquirySheet
            key={open.id}
            inquiry={open}
            draft={draftOf(open)}
            onDraftChange={(value) => setDrafts((prev) => ({ ...prev, [open.id]: value }))}
            busy={busyId === open.id}
            error={actionError}
            onClose={close}
            onSend={() => send(open)}
            onReject={() => reject(open)}
            onReassign={(loadId) => reassign(open, loadId)}
            onOpenLoad={(loadId) => navigate(`/loads/${loadId}`)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default InquiriesScreen;
