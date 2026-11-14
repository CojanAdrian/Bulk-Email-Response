import ConnectionIndicator from '../components/ConnectionIndicator';
import { LogoutIcon } from '../components/icons';

function initialsOf(name) {
  const parts = String(name || '').split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : String(name || '?').slice(0, 2);
  return letters.toUpperCase();
}

// Who is signed in. The name opens Settings.
function AccountPill({ username, onLogout, onOpenSettings }) {
  return (
    <div className="mat flex items-center gap-1 rounded-full py-[5px] pl-[5px] pr-1.5 text-[12.5px] font-medium text-text-muted">
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
        className="flex items-center gap-2.5 rounded-full pr-2 transition-[scale,color] duration-300 ease-spring hover:scale-105 hover:text-text"
      >
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">
          {initialsOf(username)}
        </span>
        <span className="hidden max-w-[10rem] truncate lg:inline" title={username}>
          {username}
        </span>
      </button>
      <ConnectionIndicator />
      <button
        type="button"
        onClick={onLogout}
        aria-label="Log out"
        title="Log out"
        className="ml-1 grid h-7 w-7 place-items-center rounded-full text-text-muted transition-colors hover:bg-white/10 hover:text-text"
      >
        <LogoutIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default AccountPill;
