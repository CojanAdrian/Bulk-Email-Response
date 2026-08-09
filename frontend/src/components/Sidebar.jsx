import { BoxIcon, MailIcon, LogoutIcon } from './icons';
import ThemeToggle from './ThemeToggle';
import ConnectionIndicator from './ConnectionIndicator';
import { useGmailConnected } from '../lib/useGmailConnected';
import logoIcon from '../assets/logo-icon.png';

function NavButton({ icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        active ? 'bg-accent text-accent-ink shadow-[0_4px_14px_rgba(215,255,61,0.35)]' : 'text-shell-text-muted hover:bg-shell-surface hover:text-shell-text'
      }`}
    >
      {icon}
      {label}
      {badge && (
        // Decorative nudge only -- deliberately not in the accessible name
        // (the button's name stays exactly the nav label); the connection
        // panel itself announces "not connected" once the user gets there.
        <span
          aria-hidden="true"
          title={badge}
          data-testid="gmail-nudge-badge"
          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${active ? 'bg-accent-ink' : 'bg-warning'}`}
        />
      )}
    </button>
  );
}

function Sidebar({ tab, onTabChange, username, onLogout }) {
  const gmailConnected = useGmailConnected();

  return (
    <aside className="relative z-10 flex w-64 shrink-0 flex-col gap-6 border-r border-shell-border bg-shell-surface/70 px-4 py-6 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <img src={logoIcon} alt="" className="h-10 w-10 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
        <span className="text-lg font-extrabold tracking-wide text-shell-text">BulkPosting</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <NavButton icon={<BoxIcon className="h-5 w-5" />} label="Loads" active={tab === 'loads'} onClick={() => onTabChange('loads')} />
        <NavButton
          icon={<MailIcon className="h-5 w-5" />}
          label="Inquiries"
          active={tab === 'inquiries'}
          onClick={() => onTabChange('inquiries')}
          badge={gmailConnected === false ? 'Gmail not connected — click to connect' : null}
        />
      </nav>
      <div className="flex flex-col gap-3 border-t border-shell-border pt-4">
        <div className="flex items-center justify-between px-2">
          <span className="flex min-w-0 items-center gap-2 truncate text-sm text-shell-text-muted">
            <ConnectionIndicator />
            <span className="truncate">{username}</span>
          </span>
          <ThemeToggle />
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-shell-text-muted transition hover:bg-shell-surface hover:text-shell-text"
        >
          <LogoutIcon className="h-5 w-5" />
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
