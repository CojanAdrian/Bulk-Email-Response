import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import GmailConnectionPanel from '../components/GmailConnectionPanel';
import ReviewQueue from '../components/ReviewQueue';
import InquiriesLog from '../components/InquiriesLog';
import CarriersPanel from '../components/CarriersPanel';
import CarrierMapPage from './CarrierMapPage';
import StatsPage from './StatsPage';
import InquiriesStatsRow from '../components/InquiriesStatsRow';
import SecondaryButton from '../components/SecondaryButton';
import AppShell from '../shell/AppShell';
import { tabFromPath } from '../shell/routes';
import { useMotionPreset } from '../lib/motionConfig';
import { useHotkeys, focusPageSearch } from '../lib/useHotkeys';
import CustomersPage from './CustomersPage';
import LoadsScreen from '../screens/loads/LoadsScreen';

const TAB_TITLES = {
  inquiries: 'Inquiries',
  carriers: 'Carriers',
  customers: 'Customers',
  stats: 'Stats',
};

const TAB_SUBTITLES = {
  inquiries: 'Carrier emails about your loads, matched and ready to answer.',
  carriers: 'Every carrier you work with and the lanes they run.',
  customers: 'Every customer’s loads and the carriers who hauled them.',
  stats: 'Booked loads, rates and gross profit.',
};

// Leaves room under the content for the phone's fixed bottom tab bar.
const PAGE_CLASS = 'mx-auto w-full min-w-0 max-w-[1400px] px-4 pb-28 pt-4 sm:px-6 md:pb-10';

function CarriersViewToggle({ carriersView, onChange }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('find')}
        aria-pressed={carriersView === 'find'}
        className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold backdrop-blur-xl transition ${
          carriersView === 'find' ? 'bg-accent text-accent-ink' : 'border border-shell-border bg-surface-alt text-text-muted hover:text-text'
        }`}
      >
        Find matches
      </button>
      <button
        type="button"
        onClick={() => onChange('manage')}
        aria-pressed={carriersView === 'manage'}
        className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
          carriersView === 'manage' ? 'bg-accent text-accent-ink' : 'border border-white/15 bg-black/40 text-white/80 backdrop-blur-xl hover:text-white'
        }`}
      >
        All carriers
      </button>
    </div>
  );
}

function MainToolPage({ username, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPath(location.pathname);
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusedMatchLoad, setFocusedMatchLoad] = useState(null);
  const [carriersView, setCarriersView] = useState('find'); // 'find' | 'manage'
  const [inquiriesRefreshKey, setInquiriesRefreshKey] = useState(0);
  const preset = useMotionPreset();

  function handleUploadComplete() {
    setRefreshKey((k) => k + 1);
  }

  function handleViewMatches(load) {
    setFocusedMatchLoad(load);
    setCarriersView('find');
    navigate('/carriers');
  }

  // The bare address opens the Loads board; the query string (Google
  // sign-in results) is kept for the hooks that read it.
  useEffect(() => {
    if (location.pathname === '/') navigate({ pathname: '/loads', search: location.search }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useHotkeys({ '/': focusPageSearch });

  return (
    <AppShell username={username} onLogout={onLogout} onLoadsImported={handleUploadComplete} mapDimmed={tab !== 'loads'}>
      <div className="relative z-10 min-w-0">
        {tab !== 'loads' && !(tab === 'carriers' && carriersView === 'find') && (
          <header className="mx-auto flex w-full max-w-[1400px] items-end justify-between gap-3 px-4 pt-6 sm:px-6 sm:pt-8">
            <div className="min-w-0">
              <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-shell-text sm:text-[32px]">{TAB_TITLES[tab]}</h1>
              <p className="mt-0.5 text-sm text-shell-text-muted">{TAB_SUBTITLES[tab]}</p>
            </div>
            {tab === 'inquiries' && (
              <SecondaryButton onClick={() => setInquiriesRefreshKey((k) => k + 1)} className="shrink-0 px-4 py-2 text-xs">
                Refresh
              </SecondaryButton>
            )}
          </header>
        )}
        {/* Outside AnimatePresence: the board's panels are position: fixed,
            and a fading wrapper would become their containing block. */}
        {tab === 'loads' && (
          <main>
            <LoadsScreen refreshKey={refreshKey} onViewMatches={handleViewMatches} />
          </main>
        )}
        <AnimatePresence>
          {tab === 'inquiries' && (
            <motion.main key="inquiries" {...preset.crossfade} className={`${PAGE_CLASS} space-y-4 sm:space-y-6`}>
              <InquiriesStatsRow refreshKey={inquiriesRefreshKey} />
              <ReviewQueue key={`review-${inquiriesRefreshKey}`} />
              <GmailConnectionPanel />
              <InquiriesLog refreshKey={inquiriesRefreshKey} />
            </motion.main>
          )}
          {tab === 'carriers' && carriersView === 'manage' && (
            <motion.main key="carriers-manage" {...preset.crossfade} className={`${PAGE_CLASS} space-y-4`}>
              <CarriersViewToggle carriersView={carriersView} onChange={setCarriersView} />
              <CarriersPanel />
            </motion.main>
          )}
          {tab === 'carriers' && carriersView === 'find' && (
            <motion.main key="carriers-find" {...preset.crossfade} className="relative w-full pb-[4.5rem] md:h-[calc(100dvh-72px)] md:overflow-hidden md:pb-0">
              <CarrierMapPage focusedLoad={focusedMatchLoad} onClearFocusedLoad={() => setFocusedMatchLoad(null)} />
              {/* Floats over the globe instead of sitting in a separate header
                  strip above it, so the whole tab reads as one continuous
                  canvas rather than chrome-then-a-boxed-panel. Kept to just the
                  title/toggle on the left -- the "clear load" action lives in
                  CarrierMapPage's own search panel now, since a full-width bar
                  here collided with the docked match list on the right. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-3 bg-gradient-to-b from-black/50 to-transparent p-4 sm:px-6">
                <h1 className="pointer-events-auto text-xl font-extrabold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">Carriers</h1>
                <div className="pointer-events-auto">
                  <CarriersViewToggle carriersView={carriersView} onChange={setCarriersView} />
                </div>
              </div>
            </motion.main>
          )}
          {tab === 'customers' && (
            <motion.main key="customers" {...preset.crossfade} className={PAGE_CLASS}>
              <CustomersPage />
            </motion.main>
          )}
          {tab === 'stats' && (
            <motion.main key="stats" {...preset.crossfade} className={`${PAGE_CLASS} space-y-4 sm:space-y-6`}>
              <StatsPage />
            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

export default MainToolPage;
