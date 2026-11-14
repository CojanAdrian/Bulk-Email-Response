import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NAV, tabFromPath } from './routes';
import { BoxIcon, MailIcon, TruckIcon, UsersIcon, ChartBarIcon, SearchIcon } from '../components/icons';
import { useMotionPreset } from '../lib/motionConfig';

const ICONS = { loads: BoxIcon, inquiries: MailIcon, carriers: TruckIcon, customers: UsersIcon, stats: ChartBarIcon };
const PILL_SPRING = { type: 'spring', stiffness: 420, damping: 30 };

// Decorative: the button's accessible name stays exactly the tab label.
function InquiriesMarker({ count, gmailConnected, active }) {
  if (gmailConnected === false) {
    return (
      <span
        aria-hidden="true"
        title="Gmail not connected"
        data-testid="gmail-nudge-badge"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-accent-ink' : 'bg-hot'}`}
      />
    );
  }
  if (count > 0) {
    return (
      <span
        aria-hidden="true"
        title={`${count} inquir${count === 1 ? 'y' : 'ies'} waiting for review`}
        data-testid="pending-review-badge"
        className={`rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums ${active ? 'bg-accent-ink text-accent' : 'bg-hot text-black'}`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return null;
}

// The app's navigation: a floating pill at the bottom on desktop, a
// full-width tab bar on phones. The white pill slides to the active tab.
function CommandBar({ pendingCount = 0, gmailConnected = null, onSearch }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const preset = useMotionPreset();
  const active = tabFromPath(pathname);

  // "(3) BulkPosting" in the browser tab when inquiries are waiting.
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) BulkPosting` : 'BulkPosting';
  }, [pendingCount]);

  return (
    <nav
      aria-label="Primary"
      className="mat fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 md:inset-x-auto md:bottom-[22px] md:left-1/2 md:-translate-x-1/2 md:rounded-full md:p-1.5"
    >
      {NAV.map(({ key, label, path }) => {
        const Icon = ICONS[key];
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => navigate(path)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative isolate flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-medium transition-colors duration-200 md:min-h-0 md:flex-none md:flex-row md:gap-2 md:px-5 md:py-[11px] md:text-[13.5px] ${
              isActive ? 'font-semibold text-accent-ink' : 'text-text-muted hover:text-text'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={preset.reduced ? undefined : 'command-pill'}
                aria-hidden="true"
                transition={PILL_SPRING}
                className="absolute inset-0 -z-10 rounded-full bg-accent"
              />
            )}
            <Icon className="h-[18px] w-[18px] shrink-0 md:hidden" />
            <span className="max-w-full truncate">{label}</span>
            {key === 'inquiries' && <InquiriesMarker count={pendingCount} gmailConnected={gmailConnected} active={isActive} />}
          </button>
        );
      })}
      {onSearch && (
        <>
          <span aria-hidden="true" className="mx-1.5 hidden h-[22px] w-px bg-white/15 md:block" />
          <button
            type="button"
            onClick={onSearch}
            className="hidden items-center gap-2.5 rounded-full px-4 py-2.5 text-[12.5px] text-text-muted transition-colors hover:bg-white/10 hover:text-text md:flex"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            Search
            <kbd className="font-sans text-text-muted/60">Ctrl K</kbd>
          </button>
        </>
      )}
    </nav>
  );
}

export default CommandBar;
