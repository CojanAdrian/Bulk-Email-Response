import ConnectionIndicator from '../components/ConnectionIndicator';
import { LogoutIcon } from '../components/icons';

function initialsOf(username) {
  const parts = String(username || '').split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : String(username || '?').slice(0, 2);
  return letters.toUpperCase();
}

function AccountPill({ username, onLogout }) {
  return (
    <div className="mat flex items-center gap-2.5 rounded-full py-[5px] pl-[5px] pr-1.5 text-[12.5px] font-medium text-text-muted">
      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">
        {initialsOf(username)}
      </span>
      <span className="hidden max-w-[10rem] truncate lg:inline" title={username}>
        {username}
      </span>
      <ConnectionIndicator />
      <button
        type="button"
        onClick={onLogout}
        aria-label="Log out"
        title="Log out"
        className="grid h-7 w-7 place-items-center rounded-full text-text-muted transition-colors hover:bg-white/10 hover:text-text"
      >
        <LogoutIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default AccountPill;
