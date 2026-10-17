import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import Badge from './Badge';
import Skeleton from './Skeleton';

const REPLY_STATUS_LABELS = {
  none: 'No match',
  pending_review: 'Pending review',
  auto_sent: 'Auto-sent',
  sent: 'Sent',
  rejected: 'Rejected',
};

const MATCH_TIER_LABELS = {
  load_number: 'Load #',
  city_state: 'City + state',
  city: 'City',
  state: 'State',
  manual: 'Manually matched',
  none: 'No match',
};

function formatReceived(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const REPLY_STATUS_VARIANTS = {
  none: 'default',
  pending_review: 'warning',
  auto_sent: 'success',
  sent: 'success',
  rejected: 'error',
};

function InquiriesLog({ refreshKey }) {
  const preset = useMotionPreset();
  const [inquiries, setInquiries] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    setStatus('loading');
    setError(null);
    listInquiries()
      .then((data) => {
        if (!ignore) {
          setInquiries(data);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load inquiries.');
          setStatus('error');
        }
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const unsubscribeNew = subscribe('inquiry:new', (inquiry) => {
      setInquiries((prev) => [inquiry, ...prev]);
    });
    const unsubscribeUpdated = subscribe('inquiry:updated', (inquiry) => {
      setInquiries((prev) => prev.map((existing) => (existing.id === inquiry.id ? inquiry : existing)));
    });
    return () => {
      unsubscribeNew();
      unsubscribeUpdated();
    };
  }, []);

  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold text-text">Inquiry log</h2>
      {status === 'loading' && <Skeleton count={4} height="1.75rem" />}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && inquiries.length === 0 && <p className="text-sm text-text-muted">No inquiries yet.</p>}
      {status === 'ready' && inquiries.length > 0 && (
        <ul aria-label="Inquiries" className="-mx-1 divide-y divide-border/70">
          <AnimatePresence initial={false}>
            {inquiries.map((inquiry) => {
              const multiStopFlag = detectMultiStop({
                comment: inquiry.matched_load_comment,
                stops: inquiry.matched_load_stops,
              });
              return (
                <motion.li
                  key={inquiry.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={preset.reduced ? { duration: 0.05 } : { duration: 0.25 }}
                  className="min-w-0 px-1 py-2.5 text-sm text-text"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold" title={inquiry.from_address}>
                      {inquiry.from_address}
                    </p>
                    <Badge variant={REPLY_STATUS_VARIANTS[inquiry.reply_status] || 'default'}>
                      {REPLY_STATUS_LABELS[inquiry.reply_status] || inquiry.reply_status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-text-muted" title={inquiry.subject}>
                    {inquiry.subject || '(no subject)'}
                  </p>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-text-muted">
                    <time dateTime={inquiry.received_at} title={new Date(inquiry.received_at).toLocaleString()}>
                      {formatReceived(inquiry.received_at)}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span>{MATCH_TIER_LABELS[inquiry.match_tier] || inquiry.match_tier}</span>
                    {Boolean(inquiry.ref_mismatch) && <Badge variant="warning">Different load?</Badge>}
                    {multiStopFlag && <Badge variant="error">{multiStopFlag}</Badge>}
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

export default InquiriesLog;
