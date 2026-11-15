import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { changePassword } from '../api/auth';
import { getGmailStatus, setSignature, getGoogleSignature } from '../api/gmail';
import { formatMoney } from '../lib/formatMoney';
import { Toggle, Stepper, Segmented } from '../ui/controls';
import { CloseButton } from '../ui/Sheet';
import InboxCard from '../screens/inquiries/InboxCard';
import { DesktopDownload } from './DesktopDownload';
import { useSettings } from './SettingsContext';

export const SECTIONS = [
  { key: 'targets', label: 'Targets', blurb: 'What a good day looks like for you. These drive the Today panel and Stats.' },
  { key: 'profile', label: 'Profile', blurb: 'Who you are in the app.' },
  { key: 'gmail', label: 'Gmail & replies', blurb: 'How the app reads your inbox and answers carriers.' },
  { key: 'board', label: 'Board', blurb: 'How your load board behaves.' },
  { key: 'notifications', label: 'Notifications', blurb: 'When the app should get your attention.' },
  { key: 'appearance', label: 'Appearance', blurb: 'How it looks and moves.' },
  { key: 'download', label: 'Download app', blurb: 'BulkPosting in its own window on your computer.' },
];

const TABS = [
  { value: 'loads', label: 'Loads' },
  { value: 'inquiries', label: 'Inquiries' },
  { value: 'stats', label: 'Stats' },
];

function Option({ title, hint, children, index = 0 }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/[0.07] py-4 motion-safe:animate-[rise-in_700ms_var(--spring)_both]" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="min-w-[12rem] flex-1">
        <p className="text-[14.5px] font-semibold tracking-[-0.015em]">{title}</p>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Targets() {
  const { settings, update } = useSettings();
  const t = settings.targets;
  const set = (key) => (value) => update({ targets: { [key]: value } });
  return (
    <>
      <Option index={0} title="Loads booked per day" hint="The ring on the Today panel fills toward this.">
        <Stepper label="loads per day" value={t.loadsPerDay} onChange={set('loadsPerDay')} min={1} max={500} format={(v) => `${v} loads`} />
      </Option>
      <Option index={1} title="Margin per load" hint="Loads booked under this show in orange on Stats.">
        <Stepper label="margin per load" value={t.marginPerLoad} onChange={set('marginPerLoad')} step={50} max={100000} format={formatMoney} />
      </Option>
      <Option index={2} title="Reply time" hint="Inquiries waiting longer than this can alert you.">
        <Stepper label="reply minutes" value={t.replyMinutes} onChange={set('replyMinutes')} min={1} max={1440} format={(v) => `${v} min`} />
      </Option>
      <Option index={3} title="Weekly gross profit" hint="Shown as progress on Stats for the last week.">
        <Stepper label="weekly gross profit" value={t.weeklyGp} onChange={set('weeklyGp')} step={1000} max={10000000} format={formatMoney} />
      </Option>
    </>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [state, setState] = useState({ busy: false, error: null, done: false });
  function submit(event) {
    event.preventDefault();
    if (form.next !== form.confirm) {
      setState({ busy: false, error: 'The new passwords do not match.', done: false });
      return;
    }
    setState({ busy: true, error: null, done: false });
    changePassword(form.current, form.next)
      .then(() => {
        setForm({ current: '', next: '', confirm: '' });
        setState({ busy: false, error: null, done: true });
      })
      .catch((err) => setState({ busy: false, error: err.message || 'Could not change the password.', done: false }));
  }
  const field = 'w-full rounded-xl border px-3 py-2 text-[13px] text-text';
  return (
    <form onSubmit={submit} className="grid w-full gap-2 sm:grid-cols-3">
      <input type="password" autoComplete="current-password" aria-label="Current password" placeholder="Current" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} className={field} />
      <input type="password" autoComplete="new-password" aria-label="New password" placeholder="New, 8+ characters" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} className={field} />
      <input type="password" autoComplete="new-password" aria-label="Confirm new password" placeholder="New again" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={field} />
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={state.busy || !form.next} className="rounded-full bg-white/10 px-4 py-2 text-[12.5px] font-semibold hover:bg-white/[0.18] disabled:opacity-50">
          {state.busy ? 'Saving...' : 'Change password'}
        </button>
        {state.error && (
          <span role="alert" className="text-[12.5px] text-error">
            {state.error}
          </span>
        )}
        {state.done && (
          <span role="status" className="text-[12.5px] text-success">
            Password changed.
          </span>
        )}
      </div>
    </form>
  );
}

function Profile({ username }) {
  const { settings, update } = useSettings();
  const [name, setName] = useState(settings.profile.displayName);
  useEffect(() => setName(settings.profile.displayName), [settings.profile.displayName]);
  return (
    <>
      <Option index={0} title="Name" hint="Shown in the top corner instead of your sign-in.">
        <input
          aria-label="Display name"
          value={name}
          placeholder={username}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== settings.profile.displayName && update({ profile: { displayName: name } })}
          className="w-56 rounded-xl border px-3 py-2 text-[13px] text-text"
        />
      </Option>
      <Option index={1} title="Sign-in" hint="Your username or Google account.">
        <span className="rounded-xl bg-white/[0.08] px-3 py-2 text-[13px] text-text-muted">{username}</span>
      </Option>
      <Option index={2} title="Password">
        <PasswordForm />
      </Option>
    </>
  );
}

// Your Gmail signature exactly as carriers see it, on white like an email.
// No scripts run inside; the frame only grows to fit.
function SignaturePreview({ html }) {
  const [height, setHeight] = useState(80);
  return (
    <iframe
      title="Your Gmail signature"
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><html><body style="margin:0;padding:14px 16px;background:#fff;color:#222;font:13px Arial,sans-serif">${html}</body></html>`}
      onLoad={(event) => {
        const doc = event.currentTarget.contentDocument;
        if (doc?.body) setHeight(Math.min(Math.max(doc.body.scrollHeight, 40), 360));
      }}
      style={{ height }}
      className="w-full rounded-[14px] border-0 bg-white"
    />
  );
}

function SignatureEditor() {
  const [status, setStatus] = useState(null);
  const [google, setGoogle] = useState({ state: 'loading', html: '' });
  const [draft, setDraft] = useState('');
  const [state, setState] = useState({ busy: false, saved: false, error: null });
  useEffect(() => {
    let ignore = false;
    Promise.resolve(getGmailStatus())
      .then((data) => {
        if (ignore || !data) return;
        setStatus(data);
        setDraft(data.signature || '');
        if (!data.connected) return;
        Promise.resolve(getGoogleSignature())
          .then((sig) => {
            if (!ignore) setGoogle({ state: 'ready', html: sig?.html || '' });
          })
          .catch(() => {
            if (!ignore) setGoogle({ state: 'error', html: '' });
          });
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);
  if (!status?.connected) return <p className="text-[12.5px] text-text-muted">Connect Gmail to set a signature.</p>;
  const usingGoogle = google.state === 'ready' && google.html;
  return (
    <div className="w-full">
      {google.state === 'loading' && <p className="mb-3 text-[12.5px] text-text-muted">Reading your Gmail signature…</p>}
      {usingGoogle && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-2 text-[12.5px] text-text">
            <span className="rounded-full bg-success/15 px-2 py-px text-[11px] font-semibold text-success">In use</span>
            Your Gmail signature ends every reply.
          </p>
          <SignaturePreview html={google.html} />
          <p className="mt-2 text-[11.5px] text-text-muted">To change it, edit your signature in Gmail settings. Replies pick it up within 10 minutes.</p>
        </div>
      )}
      {google.state === 'ready' && !google.html && (
        <p className="mb-3 text-[12.5px] text-text-muted">No signature is set in Gmail, so replies use the one below. Set one in Gmail and it will be used instead.</p>
      )}
      {google.state === 'error' && <p className="mb-3 text-[12.5px] text-text-muted">Could not read your Gmail signature right now; replies use the one below until it can.</p>}
      {usingGoogle && <p className="mb-1.5 text-[12px] text-text-muted">Backup, used only if Gmail cannot be reached:</p>}
      <textarea aria-label="Signature" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-[14px] border px-3 py-2 text-[13px] text-text" placeholder={'Your name\nCompany\nPhone'} />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={state.busy || draft === (status.signature || '')}
          onClick={() => {
            setState({ busy: true, saved: false, error: null });
            setSignature(draft)
              .then((data) => {
                setStatus(data);
                setState({ busy: false, saved: true, error: null });
              })
              .catch((err) => setState({ busy: false, saved: false, error: err.message || 'Could not save.' }));
          }}
          className="rounded-full bg-white/10 px-4 py-2 text-[12.5px] font-semibold hover:bg-white/[0.18] disabled:opacity-50"
        >
          {state.busy ? 'Saving...' : 'Save signature'}
        </button>
        {state.saved && <span className="text-[12.5px] text-success">Saved.</span>}
        {state.error && <span className="text-[12.5px] text-error">{state.error}</span>}
      </div>
    </div>
  );
}

function Gmail() {
  return (
    <>
      <div className="border-t border-white/[0.07] py-4">
        <InboxCard />
      </div>
      <Option index={1} title="Signature" hint="Added to every reply, sent by you or automatically.">
        <SignatureEditor />
      </Option>
    </>
  );
}

function Board() {
  const { settings, update } = useSettings();
  return (
    <Option index={0} title="Opens on" hint="The screen you land on when you open the app.">
      <Segmented label="Opening screen" value={settings.board.openingTab} onChange={(openingTab) => update({ board: { openingTab } })} options={TABS} />
    </Option>
  );
}

function Notifications() {
  const { settings, update } = useSettings();
  const n = settings.notifications;
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  function setNewInquiry(on) {
    update({ notifications: { newInquiry: on } });
    if (on && permission === 'default') Notification.requestPermission().then(setPermission);
  }
  return (
    <>
      <Option
        index={0}
        title="New inquiry"
        hint={permission === 'denied' ? 'Your browser blocks notifications for this site; the island at the top still shows them.' : 'A desktop notification when you are in another window, and the island at the top.'}
      >
        <Toggle label="Notify on a new inquiry" checked={n.newInquiry} onChange={setNewInquiry} />
      </Option>
      <Option index={1} title="Inquiry waiting too long" hint={`When one has waited past your ${settings.targets.replyMinutes}-minute reply target.`}>
        <Toggle label="Notify when an inquiry waits too long" checked={n.waitingTooLong} onChange={(on) => update({ notifications: { waitingTooLong: on } })} />
      </Option>
      <Option index={2} title="Sound">
        <Toggle label="Play a sound" checked={n.sound} onChange={(on) => update({ notifications: { sound: on } })} />
      </Option>
    </>
  );
}

function Appearance() {
  const { settings, update } = useSettings();
  const a = settings.appearance;
  return (
    <>
      <Option index={0} title="Map behind the screens" hint="Turn off on slower machines.">
        <Toggle label="Show the map" checked={a.map} onChange={(on) => update({ appearance: { map: on } })} />
      </Option>
      <Option index={1} title="Motion">
        <Segmented
          label="Motion"
          value={a.motion}
          onChange={(motion) => update({ appearance: { motion } })}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'reduced', label: 'Reduced' },
          ]}
        />
      </Option>
    </>
  );
}

const BODIES = { targets: Targets, profile: Profile, gmail: Gmail, board: Board, notifications: Notifications, appearance: Appearance, download: DesktopDownload };

// Every user's own settings. Each change is saved as soon as it is made.
function SettingsSheet({ section, username, onSection, onClose, onLogout }) {
  const { error } = useSettings();
  const current = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  const Body = BODIES[current.key];

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <motion.div className="fixed inset-0 z-[50] bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        data-sheet
        style={{ transformOrigin: '100% 0%' }}
        initial={{ opacity: 0, scale: 0.6, x: 120, y: -160 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, x: 100, y: -140, transition: { duration: 0.25 } }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        className="mat fixed inset-3 z-[52] m-auto grid h-[min(640px,calc(100dvh-24px))] w-[min(940px,calc(100vw-24px))] grid-rows-[auto_1fr] overflow-hidden rounded-[34px] text-text md:grid-cols-[230px_1fr] md:grid-rows-1"
      >
        <nav aria-label="Settings sections" className="relative flex gap-1 overflow-x-auto border-b border-white/[0.07] bg-black/25 p-3 md:flex-col md:border-b-0 md:border-r md:p-[28px_14px]">
          <h2 className="hidden px-3 pb-[18px] text-[24px] font-bold tracking-[-0.045em] md:block">Settings</h2>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSection(s.key)}
              aria-current={s.key === current.key ? 'page' : undefined}
              className={`relative isolate shrink-0 rounded-[12px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${s.key === current.key ? 'font-semibold text-black' : 'text-text-muted hover:text-text'}`}
            >
              {s.key === current.key && <motion.span layoutId="settings-slab" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 -z-10 rounded-[12px] bg-accent" />}
              {s.label}
            </button>
          ))}
          <button type="button" onClick={onLogout} className="mt-auto hidden px-3 pt-4 text-left text-[12.5px] text-text-muted hover:text-text md:block">
            Sign out
          </button>
        </nav>
        <div className="relative min-h-0 overflow-y-auto px-6 py-6 [scrollbar-width:none] md:px-[34px] md:py-[30px]">
          <CloseButton onClose={onClose} />
          <h3 className="text-[30px] font-bold tracking-[-0.05em]">{current.label}</h3>
          <p className="mb-4 mt-1.5 text-[13.5px] text-text-muted">{current.blurb}</p>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          <Body key={current.key} username={username} />
        </div>
      </motion.div>
    </>
  );
}

export default SettingsSheet;
