import { BoxIcon, MailIcon, LogoutIcon } from './icons';
import ThemeToggle from './ThemeToggle';

function NavButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        active ? 'bg-accent text-accent-ink shadow-[0_4px_14px_rgba(215,255,61,0.35)]' : 'text-shell-text-muted hover:bg-shell-surface hover:text-shell-text'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Sidebar({ tab, onTabChange, username, onLogout }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 bg-shell-bg px-4 py-6">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-lg font-black text-accent-ink">B</div>
        <span className="text-lg font-extrabold tracking-wide text-shell-text">BulkPosting</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <NavButton icon={<BoxIcon className="h-5 w-5" />} label="Loads" active={tab === 'loads'} onClick={() => onTabChange('loads')} />
        <NavButton icon={<MailIcon className="h-5 w-5" />} label="Inquiries" active={tab === 'inquiries'} onClick={() => onTabChange('inquiries')} />
      </nav>
      <div className="flex flex-col gap-3 border-t border-shell-border pt-4">
        <div className="flex items-center justify-between px-2">
          <span className="truncate text-sm text-shell-text-muted">{username}</span>
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
