import { useEffect, useState } from 'react';
import { listInquiries } from '../api/inquiries';

const REPLY_STATUS_LABELS = {
  none: 'No match',
  pending_review: 'Pending review',
  auto_sent: 'Auto-sent',
  sent: 'Sent',
  rejected: 'Rejected',
};

const REPLY_STATUS_COLORS = {
  none: 'bg-slate-700 text-slate-300',
  pending_review: 'bg-amber-900/50 text-amber-300',
  auto_sent: 'bg-emerald-900/50 text-emerald-300',
  sent: 'bg-emerald-900/50 text-emerald-300',
  rejected: 'bg-red-900/50 text-red-300',
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

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Inquiry log</h2>
      {status === 'loading' && <p className="text-sm text-slate-400">Loading inquiries...</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {status === 'ready' && inquiries.length === 0 && <p className="text-sm text-slate-400">No inquiries yet.</p>}
      {status === 'ready' && inquiries.length > 0 && (
        <table className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500">
              <th className="py-2 pr-4">Received</th>
              <th className="py-2 pr-4">From</th>
              <th className="py-2 pr-4">Subject</th>
              <th className="py-2 pr-4">Match</th>
              <th className="py-2">Reply</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((inquiry) => (
              <tr key={inquiry.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-4">{new Date(inquiry.received_at).toLocaleString()}</td>
                <td className="py-2 pr-4">{inquiry.from_address}</td>
                <td className="py-2 pr-4">{inquiry.subject}</td>
                <td className="py-2 pr-4">{inquiry.match_tier}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      REPLY_STATUS_COLORS[inquiry.reply_status] || REPLY_STATUS_COLORS.none
                    }`}
                  >
                    {REPLY_STATUS_LABELS[inquiry.reply_status] || inquiry.reply_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default InquiriesLog;
