import { useEffect, useState } from 'react';
import { listInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import Card from './Card';
import Badge from './Badge';

const REPLY_STATUS_LABELS = {
  none: 'No match',
  pending_review: 'Pending review',
  auto_sent: 'Auto-sent',
  sent: 'Sent',
  rejected: 'Rejected',
};

const REPLY_STATUS_VARIANTS = {
  none: 'default',
  pending_review: 'warning',
  auto_sent: 'success',
  sent: 'success',
  rejected: 'error',
};

function InquiriesLog({ refreshKey }) {
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
      <h2 className="mb-3 text-sm font-semibold text-text">Inquiry log</h2>
      {status === 'loading' && <p className="text-sm text-text-muted">Loading inquiries...</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && inquiries.length === 0 && <p className="text-sm text-text-muted">No inquiries yet.</p>}
      {status === 'ready' && inquiries.length > 0 && (
        <table className="w-full text-left text-sm text-text">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4">Received</th>
              <th className="py-2 pr-4">From</th>
              <th className="py-2 pr-4">Subject</th>
              <th className="py-2 pr-4">Match</th>
              <th className="py-2">Reply</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((inquiry) => (
              <tr key={inquiry.id} className="border-b border-border/60">
                <td className="py-2 pr-4">{new Date(inquiry.received_at).toLocaleString()}</td>
                <td className="py-2 pr-4">{inquiry.from_address}</td>
                <td className="py-2 pr-4">{inquiry.subject}</td>
                <td className="py-2 pr-4">{inquiry.match_tier}</td>
                <td className="py-2">
                  <Badge variant={REPLY_STATUS_VARIANTS[inquiry.reply_status] || 'default'}>
                    {REPLY_STATUS_LABELS[inquiry.reply_status] || inquiry.reply_status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default InquiriesLog;
