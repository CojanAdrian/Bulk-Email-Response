import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribe } from '../lib/liveSocket';
import { useGmailConnected } from '../lib/useGmailConnected';
import { usePendingReviewCount } from '../lib/usePendingReviewCount';
import UsMap from '../map/UsMap';
import { setDimmed } from '../map/mapStore';
import Brand from './Brand';
import Island from './Island';
import AccountPill from './AccountPill';
import CommandBar from './CommandBar';
import ImportDropzone from './ImportDropzone';
import ShellContext from './ShellContext';
import { importLoads } from '../lib/importLoads';

const ALERT_FOR_MS = 8000;
const NOTICE_FOR_MS = 4500;

// A short message for the island, e.g. the result of an import.
function useNotice() {
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((next) => {
    clearTimeout(timer.current);
    setNotice(next);
    timer.current = setTimeout(() => setNotice(null), NOTICE_FOR_MS);
  }, []);

  return [notice, show];
}

// The newest inquiry to arrive over the live socket, for a few seconds.
function useIncomingInquiry() {
  const [inquiry, setInquiry] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribe('inquiry:new', (incoming) => {
      clearTimeout(timer.current);
      setInquiry(incoming);
      timer.current = setTimeout(() => setInquiry(null), ALERT_FOR_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, []);

  function dismiss() {
    clearTimeout(timer.current);
    setInquiry(null);
  }

  return [inquiry, dismiss];
}

// The frame every screen lives in: the map behind, brand / island / account
// along the top, the command bar along the bottom.
function AppShell({ username, onLogout, mapDimmed = true, onLoadsImported, children }) {
  const gmailConnected = useGmailConnected();
  const pendingCount = usePendingReviewCount();
  const [incoming, dismissIncoming] = useIncomingInquiry();
  const [notice, showNotice] = useNotice();

  const handleImported = useCallback(
    (result, name) => {
      showNotice({ tone: 'success', title: `${name} imported`, detail: `${result.inserted} new · ${result.updated} updated` });
      onLoadsImported?.(result);
    },
    [showNotice, onLoadsImported]
  );
  const handleImportError = useCallback((message) => showNotice({ tone: 'error', title: message }), [showNotice]);

  const shell = useMemo(
    () => ({
      notify: showNotice,
      importFile: (file) =>
        importLoads(file)
          .then((result) => handleImported(result, file.name))
          .catch((err) => handleImportError(err.message)),
    }),
    [showNotice, handleImported, handleImportError]
  );

  useEffect(() => {
    setDimmed(mapDimmed);
  }, [mapDimmed]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-shell-bg text-shell-text">
      <UsMap />
      <div className="grain" aria-hidden="true" />
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 grid h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-9">
        <div className="pointer-events-auto justify-self-start">
          <Brand />
        </div>
        <div className="pointer-events-auto self-start pt-4">
          <Island inquiry={incoming} onDismiss={dismissIncoming} notice={notice} pendingCount={pendingCount} gmailConnected={gmailConnected} />
        </div>
        <div className="pointer-events-auto justify-self-end">
          <AccountPill username={username} onLogout={onLogout} />
        </div>
      </header>
      <ShellContext.Provider value={shell}>
        <div className="relative z-10 min-w-0 pt-[72px]">{children}</div>
      </ShellContext.Provider>
      <ImportDropzone onImported={handleImported} onError={handleImportError} />
      <CommandBar pendingCount={pendingCount} gmailConnected={gmailConnected} />
    </div>
  );
}

export default AppShell;
