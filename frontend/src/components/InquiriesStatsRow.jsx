import { useEffect, useState } from 'react';
import { listInquiries } from '../api/inquiries';
import { getGmailStatus } from '../api/gmail';
import { subscribe } from '../lib/liveSocket';
import Card from './Card';

function StatBlock({ label, value, accentClassName }) {
  return (
    <Card className="!p-4 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accentClassName}`}>{value}</p>
    </Card>
  );
}

function InquiriesStatsRow({ refreshKey }) {
  const [counts, setCounts] = useState(null);
  const [connected, setConnected] = useState(null);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    listInquiries()
      .then((data) => {
        if (ignore) return;
        const next = { pending_review: 0, auto_sent: 0 };
        data.forEach((inquiry) => {
          if (next[inquiry.reply_status] !== undefined) next[inquiry.reply_status] += 1;
        });
        setCounts(next);
      })
      .catch(() => {
        if (!ignore) setCounts(null);
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, liveTick]);

  useEffect(() => {
    let ignore = false;
    getGmailStatus()
      .then((data) => {
        if (!ignore) setConnected(Boolean(data.connected));
      })
      .catch(() => {
        if (!ignore) setConnected(null);
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const unsubscribeInquiry = subscribe('inquiry:new', () => setLiveTick((t) => t + 1));
    const unsubscribeUpdated = subscribe('inquiry:updated', () => setLiveTick((t) => t + 1));
    const unsubscribeGmail = subscribe('gmail:status', (payload) => setConnected(Boolean(payload.connected)));
    return () => {
      unsubscribeInquiry();
      unsubscribeUpdated();
      unsubscribeGmail();
    };
  }, []);

  if (!counts) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatBlock label="Pending review" value={counts.pending_review} accentClassName="text-warning" />
      <StatBlock label="Auto-sent" value={counts.auto_sent} accentClassName="text-success" />
      <StatBlock
        label="Gmail account"
        value={connected === null ? '—' : connected ? 'Connected' : 'Not connected'}
        accentClassName={connected ? 'text-success' : 'text-error'}
      />
    </div>
  );
}

export default InquiriesStatsRow;
