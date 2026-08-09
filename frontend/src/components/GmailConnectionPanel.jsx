import { useEffect, useRef, useState } from 'react';
import { getGmailStatus, getGmailConnectUrl, disconnectGmail } from '../api/gmail';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';

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
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-text">Gmail connection</h2>
      {status === 'loading' && <p className="text-sm text-text-muted">Checking connection...</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && !gmailStatus.connected && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">No Gmail account connected yet.</p>
          <PrimaryButton onClick={handleConnect}>Connect Gmail</PrimaryButton>
        </div>
      )}
      {status === 'ready' && gmailStatus.connected && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-text">
              Connected: <span className="font-medium text-text">{gmailStatus.gmailAddress}</span>
            </p>
            {!confirmingDisconnect && (
              <SecondaryButton onClick={() => setConfirmingDisconnect(true)} className="px-3 py-1 text-xs">
                Disconnect
              </SecondaryButton>
            )}
          </div>
          {confirmingDisconnect && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-error/40 bg-error-bg px-3 py-2">
              <p className="text-sm text-error">Disconnect this Gmail account? Auto-replies will stop until reconnected.</p>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setConfirmingDisconnect(false)} className="px-3 py-1 text-xs">
                  Cancel
                </SecondaryButton>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="rounded-lg bg-error px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {disconnecting ? 'Disconnecting...' : 'Confirm disconnect'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default GmailConnectionPanel;
