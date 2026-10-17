import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { BoxIcon, MailIcon, LogoutIcon, TruckIcon, ChartBarIcon, UsersIcon } from './icons';
import ThemeToggle from './ThemeToggle';
import ConnectionIndicator from './ConnectionIndicator';
import { useGmailConnected } from '../lib/useGmailConnected';
import { usePendingReviewCount } from '../lib/usePendingReviewCount';
import { useIsPhone } from '../lib/useMediaQuery';
import { useMotionPreset } from '../lib/motionConfig';
import logoIcon from '../assets/logo-icon.png';

export const NAV_TABS = [
  { key: 'loads', label: 'Loads', Icon: BoxIcon },
  { key: 'inquiries', label: 'Inquiries', Icon: MailIcon },
  { key: 'carriers', label: 'Carriers', Icon: TruckIcon },
  { key: 'customers', label: 'Customers', Icon: UsersIcon },
  { key: 'stats', label: 'Stats', Icon: ChartBarIcon },
];

// Decorative indicators only -- deliberately kept out of the button's
// accessible name (it stays exactly the tab label); the Gmail panel and the
// review queue themselves announce what's going on once you get there.
function TabIndicator({ badge, count, active }) {
  if (badge) {
    return (
      <span
        aria-hidden="true"
        title={badge}
        data-testid="gmail-nudge-badge"
        className={`absolute right-1.5 top-1.5 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-accent-ink' : 'bg-warning'}`}
      />
    );
  }
  if (count > 0) {
    return (
      <span
        aria-hidden="true"
        title={`${count} inquir${count === 1 ? 'y' : 'ies'} waiting for review`}
        data-testid="pending-review-badge"
        className={`inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
          active ? 'bg-accent-ink text-accent' : 'bg-warning text-surface'
        }`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return null;
}

// Desktop tab: pill with a lime thumb that glides between tabs (layoutId).
function DesktopTab({ label, Icon, active, onClick, badge, count, reduced }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-200 ${
        active ? 'text-accent-ink' : 'text-shell-text-muted hover:text-shell-text'
      }`}
    >
      {active && (
        <motion.span
          layoutId={reduced ? undefined : 'nav-thumb'}
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-accent shadow-[0_4px_14px_rgba(215,255,61,0.3)]"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {label}
      <TabIndicator badge={badge} count={count} active={active} />
    </button>
  );
}

// Phone tab: icon over label, full-height thumb target (>= 44px).
function PhoneTab({ label, Icon, active, onClick, badge, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] font-semibold transition-colors ${
        active ? 'text-shell-text' : 'text-shell-text-muted'
      }`}
    >
      <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-accent text-accent-ink' : ''}`}>
        <Icon className="h-[18px] w-[18px]" />
        {count > 0 && !badge && (
          <span className="absolute -right-1 -top-1">
            <TabIndicator count={count} active={false} />
          </span>
        )}
        {badge && <TabIndicator badge={badge} active={false} />}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

// Tablets/desktops: one slim sticky glass bar with the tabs in it.
// Phones: a compact top bar (logo, theme, log out) plus a bottom tab bar
// within thumb reach. Only one set of tabs is ever rendered.
function TopNav({ tab, onTabChange, username, onLogout }) {
  const gmailConnected = useGmailConnected();
  const pendingReviewCount = usePendingReviewCount();
  const isPhone = useIsPhone();
  const preset = useMotionPreset();

  // "(3) BulkPosting" in the browser tab when inquiries are waiting -- you
  // can tell from another tab that something needs you.
  useEffect(() => {
    document.title = pendingReviewCount > 0 ? `(${pendingReviewCount}) BulkPosting` : 'BulkPosting';
  }, [pendingReviewCount]);

  const indicatorsFor = (key) =>
    key === 'inquiries'
      ? { badge: gmailConnected === false ? 'Gmail not connected — click to connect' : null, count: pendingReviewCount }
      : { badge: null, count: 0 };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-shell-border/70 bg-shell-bg/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <img src={logoIcon} alt="" className="h-7 w-7 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
            <span className="hidden font-display text-[15px] font-bold tracking-tight text-shell-text lg:inline">BulkPosting</span>
          </div>
          {!isPhone && (
            <nav aria-label="Primary" className="isolate flex min-w-0 items-center gap-0.5 overflow-hidden">
              {NAV_TABS.map(({ key, label, Icon }) => (
                <DesktopTab
                  key={key}
                  label={label}
                  Icon={Icon}
                  active={tab === key}
                  onClick={() => onTabChange(key)}
                  reduced={preset.reduced}
                  {...indicatorsFor(key)}
                />
              ))}
            </nav>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="flex min-w-0 max-w-[12rem] items-center gap-2 text-sm text-shell-text-muted">
              <ConnectionIndicator />
              <span className="hidden truncate xl:inline" title={username}>{username}</span>
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-shell-text-muted transition hover:bg-shell-surface hover:text-shell-text"
            >
              <LogoutIcon className="h-4 w-4" />
              <span className="hidden lg:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>
      {isPhone && (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-shell-border/70 bg-shell-bg/75 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl backdrop-saturate-150"
        >
          <div className="mx-auto flex max-w-md items-stretch gap-1">
            {NAV_TABS.map(({ key, label, Icon }) => (
              <PhoneTab key={key} label={label} Icon={Icon} active={tab === key} onClick={() => onTabChange(key)} {...indicatorsFor(key)} />
            ))}
          </div>
        </nav>
      )}
    </>
  );
}

export default TopNav;
