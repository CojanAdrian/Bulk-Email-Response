import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import LoadsStatsRow from '../components/LoadsStatsRow';
import RateModal from '../components/RateModal';
import AddLoadModal from '../components/AddLoadModal';
import BlastModal from '../components/BlastModal';
import PrimaryButton from '../components/PrimaryButton';
import GmailConnectionPanel from '../components/GmailConnectionPanel';
import ReviewQueue from '../components/ReviewQueue';
import InquiriesLog from '../components/InquiriesLog';
import CarriersPanel from '../components/CarriersPanel';
import CarrierMapPage from './CarrierMapPage';
import StatsPage from './StatsPage';
import InquiriesStatsRow from '../components/InquiriesStatsRow';
import DatExportSection from '../components/DatExportSection';
import SecondaryButton from '../components/SecondaryButton';
import TopNav from '../components/TopNav';
import AuroraBackground from '../components/AuroraBackground';
import { useInquiryAlerts } from '../components/InquiryAlertBanner';
import { subscribe } from '../lib/liveSocket';
import { useMotionPreset } from '../lib/motionConfig';
import { useHotkeys, focusPageSearch } from '../lib/useHotkeys';
import CustomersPage from './CustomersPage';

const TAB_TITLES = {
  loads: 'Loads',
  inquiries: 'Inquiries',
  carriers: 'Carriers',
  customers: 'Customers',
  stats: 'Stats',
};

const TAB_SUBTITLES = {
  loads: 'Your board. Gold rows are lanes a carrier has already run.',
  inquiries: 'Carrier emails about your loads, matched and ready to answer.',
  carriers: 'Every carrier you work with and the lanes they run.',
  customers: 'Who has hauled for each customer, on any lane.',
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
          carriersView === 'find' ? 'bg-accent text-accent-ink' : 'border border-white/15 bg-black/40 text-white/80 hover:text-white'
        }`}
      >
        Find matches
      </button>
      <button
        type="button"
        onClick={() => onChange('manage')}
        aria-pressed={carriersView === 'manage'}
        className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
          carriersView === 'manage' ? 'bg-accent text-accent-ink' : 'border border-shell-border bg-surface-alt text-text-muted hover:text-text'
        }`}
      >
        All carriers
      </button>
    </div>
  );
}

function MainToolPage({ username, onLogout }) {
  const [tab, setTab] = useState('loads'); // 'loads' | 'inquiries'
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [addLoadOpen, setAddLoadOpen] = useState(false);
  const [blastTarget, setBlastTarget] = useState(null);
  const [focusedMatchLoad, setFocusedMatchLoad] = useState(null);
  const [carriersView, setCarriersView] = useState('find'); // 'find' | 'manage'
  const [inquiriesRefreshKey, setInquiriesRefreshKey] = useState(0);
  const { pushAlert, viewport: inquiryAlertViewport } = useInquiryAlerts();
  const preset = useMotionPreset();
  const datExportRef = useRef(null);

  function handleUploadComplete() {
    setRefreshKey((k) => k + 1);
  }

  function handleLoadCreated() {
    setRefreshKey((k) => k + 1);
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  function handleViewMatches(load) {
    setFocusedMatchLoad(load);
    setCarriersView('find');
    setTab('carriers');
  }

  useEffect(() => {
    return subscribe('inquiry:new', (inquiry) => {
      pushAlert(`New inquiry from ${inquiry.from_address}`, {
        onView: () => setTab('inquiries'),
      });
    });
  }, [pushAlert]);

  useHotkeys({
    '/': focusPageSearch,
    n: () => {
      if (tab === 'loads') setAddLoadOpen(true);
    },
  });

  return (
    <div className="relative min-h-screen overflow-x-clip bg-shell-bg text-shell-text">
      <AuroraBackground />
      {inquiryAlertViewport}
      <TopNav tab={tab} onTabChange={setTab} username={username} onLogout={onLogout} />
      <div className="relative z-10 min-w-0">
        {!(tab === 'carriers' && carriersView === 'find') && (
          <header className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 sm:pt-8">
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-shell-text sm:text-[32px]">{TAB_TITLES[tab]}</h1>
            <p className="mt-0.5 text-sm text-shell-text-muted">{TAB_SUBTITLES[tab]}</p>
          </header>
        )}
        <AnimatePresence>
          {tab === 'loads' && (
            <motion.main key="loads" {...preset.crossfade} className={`${PAGE_CLASS} space-y-4 sm:space-y-6`}>
              <LoadsStatsRow refreshKey={refreshKey} />
              <UploadPanel
                onUploadComplete={handleUploadComplete}
                headerActions={
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => datExportRef.current?.openExportFlow()} className="px-3 py-1.5 text-xs">
                      Generate DAT Export
                    </SecondaryButton>
                    <PrimaryButton onClick={() => setAddLoadOpen(true)} className="px-3 py-1.5 text-xs">
                      + Add Load
                    </PrimaryButton>
                  </div>
                }
              />
              <LoadsTable
                refreshKey={refreshKey}
                onSelectLoad={setSelectedLoad}
                onOpenBlast={(load, showRate) => setBlastTarget({ load, showRate })}
                onViewMatches={handleViewMatches}
              />
              <DatExportSection ref={datExportRef} refreshKey={refreshKey} />
            </motion.main>
          )}
          {tab === 'inquiries' && (
            <motion.main key="inquiries" {...preset.crossfade} className={`${PAGE_CLASS} space-y-4 sm:space-y-6`}>
              <div className="flex justify-end">
                <SecondaryButton onClick={() => setInquiriesRefreshKey((k) => k + 1)} className="px-4 py-2 text-xs">
                  Refresh
                </SecondaryButton>
              </div>
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
            <motion.main key="carriers-find" {...preset.crossfade} className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden pb-[4.5rem] md:pb-0">
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
      <AnimatePresence>
        {selectedLoad && (
          <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
        )}
        {addLoadOpen && (
          <AddLoadModal onClose={() => setAddLoadOpen(false)} onCreated={handleLoadCreated} />
        )}
        {blastTarget && (
          <BlastModal load={blastTarget.load} initialShowRate={blastTarget.showRate} onClose={() => setBlastTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default MainToolPage;
