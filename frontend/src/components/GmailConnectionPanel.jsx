import { useEffect, useRef, useState } from 'react';
import { getGmailStatus, getGmailConnectUrl, disconnectGmail } from '../api/gmail';

function GmailConnectionPanel() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [gmailStatus, setGmailStatus] = useState(null);
  const [error, setError] = useState(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function fetchStatus() {
    setStatus('loading');
    setError(null);
    getGmailStatus()
      .then((data) => {
        if (isMountedRef.current) {
          setGmailStatus(data);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load Gmail connection status.');
          setStatus('error');
        }
      });
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  function handleConnect() {
    window.location.href = getGmailConnectUrl();
  }

  function handleDisconnect() {
    setDisconnecting(true);
    disconnectGmail()
      .then(() => {
        if (isMountedRef.current) {
          setConfirmingDisconnect(false);
          fetchStatus();
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to disconnect.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setDisconnecting(false);
        }
      });
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Gmail connection</h2>
      {status === 'loading' && <p className="text-sm text-slate-400">Checking connection...</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {status === 'ready' && !gmailStatus.connected && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">No Gmail account connected yet.</p>
          <button
            onClick={handleConnect}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Connect Gmail
          </button>
        </div>
      )}
      {status === 'ready' && gmailStatus.connected && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-300">
              Connected: <span className="font-medium text-slate-100">{gmailStatus.gmailAddress}</span>
            </p>
            {!confirmingDisconnect && (
              <button
                onClick={() => setConfirmingDisconnect(true)}
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
              >
                Disconnect
              </button>
            )}
          </div>
          {confirmingDisconnect && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2">
              <p className="text-sm text-red-300">
                Disconnect this Gmail account? Auto-replies will stop until reconnected.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDisconnect(false)}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="rounded-lg bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                >
                  {disconnecting ? 'Disconnecting...' : 'Confirm disconnect'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GmailConnectionPanel;
