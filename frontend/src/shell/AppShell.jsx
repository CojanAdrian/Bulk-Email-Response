import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { subscribe } from '../lib/liveSocket';
import { useGmailConnected } from '../lib/useGmailConnected';
import { usePendingReviewCount } from '../lib/usePendingReviewCount';
import { importLoads } from '../lib/importLoads';
import { listInquiries } from '../api/inquiries';
import UsMap from '../map/UsMap';
import { setDimmed } from '../map/mapStore';
import Brand from './Brand';
import Island from './Island';
import AccountPill from './AccountPill';
import CommandBar from './CommandBar';
import ImportDropzone from './ImportDropzone';
import SearchPalette from './SearchPalette';
import SettingsSheet, { SECTIONS } from './SettingsSheet';
import ShellContext from './ShellContext';
import { SettingsProvider, useSettings } from './SettingsContext';

const ALERT_FOR_MS = 8000;
const NOTICE_FOR_MS = 4500;
const WAIT_CHECK_MS = 60000;

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

function beep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.4);
  } catch {
    // No audio available; the visual alert is enough.
  }
}

// onClick runs when the notification is clicked: the window comes forward.
function notifyDesktop(title, body, onClick) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const notification = new Notification(title, { body });
    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

// The newest inquiry to arrive over the live socket, for a few seconds,
// with the user's chosen sound and desktop notification.
function useIncomingInquiry(notifications, openInquiry) {
  const [inquiry, setInquiry] = useState(null);
  const timer = useRef(null);
  const prefs = useRef(notifications);
  prefs.current = notifications;
  const open = useRef(openInquiry);
  open.current = openInquiry;

  useEffect(() => {
    const unsubscribe = subscribe('inquiry:new', (incoming) => {
      clearTimeout(timer.current);
      setInquiry(incoming);
      timer.current = setTimeout(() => setInquiry(null), ALERT_FOR_MS);
      if (!prefs.current.newInquiry) return;
      if (prefs.current.sound) beep();
      notifyDesktop(`New inquiry from ${incoming?.from_address || 'a carrier'}`, incoming?.subject || '', () => {
        clearTimeout(timer.current);
        setInquiry(null);
        open.current(incoming);
      });
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

// Checks once a minute whether the oldest waiting inquiry is past the
// reply-time target, and says so once per inquiry.
function useWaitingTooLong({ enabled, minutes, notify }) {
  const told = useRef(new Set());
  useEffect(() => {
    if (!enabled) return undefined;
    function check() {
      Promise.resolve(listInquiries('pending_review', { order: 'oldest' }))
        .then((queue) => {
          const oldest = Array.isArray(queue) ? queue[0] : null;
          if (!oldest || told.current.has(oldest.id)) return;
          const waited = (Date.now() - new Date(oldest.received_at).getTime()) / 60000;
          if (!(waited > minutes)) return;
          told.current.add(oldest.id);
          notify(Math.round(waited), oldest);
        })
        .catch(() => {});
    }
    const id = setInterval(check, WAIT_CHECK_MS);
    return () => clearInterval(id);
  }, [enabled, minutes, notify]);
}

function Shell({ username, onLogout, mapDimmed, onLoadsImported, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const gmailConnected = useGmailConnected();
  const pendingCount = usePendingReviewCount();
  const [incoming, dismissIncoming] = useIncomingInquiry(settings.notifications, (inquiry) => navigate(inquiry?.id ? `/inquiries/${inquiry.id}` : '/inquiries'));
  const [notice, showNotice] = useNotice();
  const [searching, setSearching] = useState(false);
  const reduced = settings.appearance.motion === 'reduced';

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

  const tooLong = useCallback(
    (waited, oldest) => {
      showNotice({ tone: 'error', title: `An inquiry has waited ${waited} min`, detail: 'Inquiries' });
      if (settings.notifications.sound) beep();
      notifyDesktop('An inquiry is waiting', `It has waited ${waited} minutes.`, () => navigate(oldest?.id ? `/inquiries/${oldest.id}` : '/inquiries'));
    },
    [showNotice, settings.notifications.sound, navigate]
  );
  useWaitingTooLong({ enabled: settings.notifications.waitingTooLong, minutes: settings.targets.replyMinutes, notify: tooLong });

  useEffect(() => {
    setDimmed(mapDimmed);
  }, [mapDimmed]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
  }, [reduced]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearching((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const settingsMatch = location.pathname.match(/^\/settings(?:\/([a-z]+))?/);
  const settingsSection = settingsMatch ? settingsMatch[1] || SECTIONS[0].key : null;
  const backTo = location.state?.from || '/loads';
  const displayName = settings.profile.displayName || username;

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      <div className="relative min-h-screen overflow-x-clip bg-shell-bg text-shell-text">
        {settings.appearance.map && <UsMap />}
        <div className="grain" aria-hidden="true" />
        <header className="pointer-events-none fixed inset-x-0 top-0 z-40 grid h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-9">
          <div className="pointer-events-auto justify-self-start">
            <Brand />
          </div>
          <div className="pointer-events-auto self-start pt-4">
            <Island inquiry={incoming} onDismiss={dismissIncoming} notice={notice} pendingCount={pendingCount} gmailConnected={gmailConnected} />
          </div>
          <div className="pointer-events-auto justify-self-end">
            <AccountPill
              username={displayName}
              onLogout={onLogout}
              onOpenSettings={() => navigate('/settings/targets', { state: { from: settingsSection ? backTo : location.pathname } })}
            />
          </div>
        </header>
        <ShellContext.Provider value={shell}>
          <div className="relative z-10 min-w-0 pt-[72px]">{children}</div>
        </ShellContext.Provider>
        <ImportDropzone onImported={handleImported} onError={handleImportError} />
        <CommandBar pendingCount={pendingCount} gmailConnected={gmailConnected} onSearch={() => setSearching(true)} />
        <AnimatePresence>
          {searching && (
            <SearchPalette
              onClose={() => setSearching(false)}
              onGo={(to) => {
                setSearching(false);
                navigate(to);
              }}
            />
          )}
          {settingsSection && (
            <SettingsSheet
              section={settingsSection}
              username={username}
              onSection={(key) => navigate(`/settings/${key}`, { replace: true, state: { from: backTo } })}
              onClose={() => navigate(backTo)}
              onLogout={onLogout}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

// The frame every screen lives in: the map behind, brand / island / account
// along the top, the command bar along the bottom, and Settings and search
// over everything.
function AppShell(props) {
  return (
    <SettingsProvider>
      <Shell {...props} />
    </SettingsProvider>
  );
}

export default AppShell;
