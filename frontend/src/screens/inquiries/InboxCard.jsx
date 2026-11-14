import { useEffect, useState } from 'react';
import { getGmailStatus, getGmailConnectUrl, disconnectGmail, setAutoSendEnabled } from '../../api/gmail';
import { subscribe } from '../../lib/liveSocket';
import { GoogleIcon } from '../../components/icons';
import { Toggle } from '../../ui/controls';

// The connected Gmail inbox: which address, whether exact matches are
// answered automatically, and connect / disconnect.
function InboxCard() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let ignore = false;
    Promise.resolve(getGmailStatus())
      .then((data) => {
        if (!ignore) setStatus(data);
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'Could not check the Gmail connection.');
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => subscribe('gmail:status', (payload) => payload && setStatus(payload)), []);

  function run(promise) {
    setBusy(true);
    setError(null);
    return promise
      .then((data) => data && setStatus(data))
      .catch((err) => setError(err.message || 'Something went wrong.'))
      .finally(() => setBusy(false));
  }

  return (
    <section aria-label="Gmail connection" className="mat rounded-[28px] p-[18px]">
      <h2 className="caps flex items-center justify-between">
        <span>Inbox</span>
        {status && <span className={status.connected ? 'text-success' : 'text-hot'}>{status.connected ? 'Live' : 'Not connected'}</span>}
      </h2>
      {!status && !error && <p className="mt-3 text-[13px] text-text-muted">Checking connection...</p>}
      {status && !status.connected && (
        <>
          <p className="mt-3 text-[13px] leading-snug text-text-muted">Connect Gmail so carrier emails about your loads show up here, matched and ready to answer.</p>
          <button
            type="button"
            onClick={() => {
              window.location.href = getGmailConnectUrl();
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-[13px] font-semibold text-accent-ink transition-[scale] duration-300 ease-spring active:scale-95"
          >
            <GoogleIcon className="h-4 w-4" />
            Connect Gmail
          </button>
        </>
      )}
      {status?.connected && (
        <>
          <p className="mt-3 truncate text-[15px] font-semibold tracking-[-0.02em]" title={status.gmailAddress}>
            {status.gmailAddress}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3.5">
            <div>
              <p className="text-[13px] font-semibold">Answer exact matches</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-text-muted">Only when they quote one of your load numbers.</p>
            </div>
            <Toggle checked={Boolean(status.autoSendEnabled)} onChange={(next) => run(setAutoSendEnabled(next))} disabled={busy} label="Auto-send confident matches" />
          </div>
          {confirming ? (
            <div className="mt-3.5 flex items-center gap-2 text-xs">
              <span className="text-error">Stop reading this inbox?</span>
              <button type="button" onClick={() => run(disconnectGmail().then(() => ({ connected: false }))).then(() => setConfirming(false))} disabled={busy} className="ml-auto rounded-full bg-error px-3 py-1.5 font-semibold text-black">
                Disconnect
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full bg-white/10 px-3 py-1.5">
                Keep
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="mt-3.5 text-xs text-text-muted hover:text-error">
              Disconnect
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-error">
          {error}
        </p>
      )}
    </section>
  );
}

export default InboxCard;
