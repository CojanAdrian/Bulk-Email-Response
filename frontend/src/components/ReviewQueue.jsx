import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listInquiries, sendInquiryReply, rejectInquiry } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';

function ReviewQueue() {
  const preset = useMotionPreset();
  const [inquiries, setInquiries] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
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
          setDrafts(Object.fromEntries(data.map((inquiry) => [inquiry.id, inquiry.reply_body || ''])));
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
      setDrafts((prev) => ({ ...prev, [inquiry.id]: inquiry.reply_body || '' }));
    });
    const unsubscribeUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (inquiry.reply_status === 'pending_review') return;
      setInquiries((prev) => prev.filter((existing) => existing.id !== inquiry.id));
    });
    return () => {
      unsubscribeNew();
      unsubscribeUpdated();
    };
  }, []);

  function handleDraftChange(id, value) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
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
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {inquiries.map((inquiry, index) => (
              <motion.li
                key={inquiry.id}
                layout
                {...preset.popIn}
                transition={{ ...preset.popIn.transition, delay: index * preset.stagger }}
                className="rounded-xl border border-border bg-surface-alt p-4"
              >
                <div className="mb-2 text-sm text-text">
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
                </div>
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`reply-${inquiry.id}`}>
                  Reply
                </label>
                <textarea
                  id={`reply-${inquiry.id}`}
                  value={drafts[inquiry.id] ?? ''}
                  onChange={(e) => handleDraftChange(inquiry.id, e.target.value)}
                  rows={5}
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
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

export default ReviewQueue;
