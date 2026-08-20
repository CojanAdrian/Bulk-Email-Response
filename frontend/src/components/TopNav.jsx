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
      className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
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
          className={`absolute right-1.5 top-1.5 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-accent-ink' : 'bg-warning'}`}
        />
      )}
    </button>
  );
}

// A slim horizontal bar instead of a full-height sidebar -- the old 256px
// vertical rail ate most of the width in a narrow browser window (the
// common case here: this tool sits open alongside several other tabs), for
// nav links that only ever need two rows' worth of space.
function TopNav({ tab, onTabChange, username, onLogout }) {
  const gmailConnected = useGmailConnected();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-shell-border bg-shell-surface/80 px-4 py-2.5 backdrop-blur-xl sm:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <img src={logoIcon} alt="" className="h-7 w-7 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
        <span className="hidden text-sm font-extrabold tracking-wide text-shell-text sm:inline">BulkPosting</span>
      </div>
      <nav className="flex items-center gap-1">
        <NavButton icon={<BoxIcon className="h-4 w-4" />} label="Loads" active={tab === 'loads'} onClick={() => onTabChange('loads')} />
        <NavButton
          icon={<MailIcon className="h-4 w-4" />}
          label="Inquiries"
          active={tab === 'inquiries'}
          onClick={() => onTabChange('inquiries')}
          badge={gmailConnected === false ? 'Gmail not connected — click to connect' : null}
        />
      </nav>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="hidden min-w-0 items-center gap-2 truncate text-sm text-shell-text-muted sm:flex">
          <ConnectionIndicator />
          <span className="truncate">{username}</span>
        </span>
        <ThemeToggle />
        <button
          onClick={onLogout}
          aria-label="Log out"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-shell-text-muted transition hover:bg-shell-surface hover:text-shell-text"
        >
          <LogoutIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  );
}

export default TopNav;
