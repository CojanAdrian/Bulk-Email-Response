import { useEffect, useRef, useState } from 'react';
import { listInquiries, sendInquiryReply, rejectInquiry } from '../api/inquiries';

function ReviewQueue() {
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Review queue</h2>
      {status === 'loading' && <p className="text-sm text-slate-400">Loading review queue...</p>}
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {status === 'ready' && inquiries.length === 0 && (
        <p className="text-sm text-slate-400">Nothing waiting for review.</p>
      )}
      {status === 'ready' && inquiries.length > 0 && (
        <ul className="space-y-4">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-2 text-sm text-slate-300">
                <span className="font-medium text-slate-100">{inquiry.from_address}</span> — {inquiry.subject}
              </div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor={`reply-${inquiry.id}`}>
                Reply
              </label>
              <textarea
                id={`reply-${inquiry.id}`}
                value={drafts[inquiry.id] ?? ''}
                onChange={(e) => handleDraftChange(inquiry.id, e.target.value)}
                rows={5}
                className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleReject(inquiry.id)}
                  disabled={actioningId === inquiry.id}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleSend(inquiry.id)}
                  disabled={actioningId === inquiry.id}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {actioningId === inquiry.id ? 'Sending...' : 'Send'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ReviewQueue;
