import { useEffect, useState } from 'react';
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
import InquiriesStatsRow from '../components/InquiriesStatsRow';
import DatExportSection from '../components/DatExportSection';
import SecondaryButton from '../components/SecondaryButton';
import TopNav from '../components/TopNav';
import AuroraBackground from '../components/AuroraBackground';
import { useInquiryAlerts } from '../components/InquiryAlertBanner';
import { subscribe } from '../lib/liveSocket';
import { useMotionPreset } from '../lib/motionConfig';

const TAB_TITLES = {
  loads: 'Loads',
  inquiries: 'Inquiries',
  carriers: 'Carriers',
};

function CarriersViewToggle({ carriersView, onChange }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('find')}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          carriersView === 'find' ? 'bg-accent text-accent-ink' : 'border border-shell-border text-shell-text-muted hover:text-shell-text'
        }`}
      >
        Find matches
      </button>
      <button
        type="button"
        onClick={() => onChange('manage')}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          carriersView === 'manage' ? 'bg-accent text-accent-ink' : 'border border-shell-border text-shell-text-muted hover:text-shell-text'
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-shell-bg text-shell-text">
      <AuroraBackground />
      {inquiryAlertViewport}
      <TopNav tab={tab} onTabChange={setTab} username={username} onLogout={onLogout} />
      <div className="relative z-10 min-w-0">
        {!(tab === 'carriers' && carriersView === 'find') && (
          <header className="px-4 pt-6 sm:px-6">
            <h1 className="text-2xl font-extrabold tracking-tight text-shell-text">{TAB_TITLES[tab]}</h1>
          </header>
        )}
        <AnimatePresence>
          {tab === 'loads' && (
            <motion.main key="loads" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
              <LoadsStatsRow refreshKey={refreshKey} />
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-[16rem] flex-1">
                  <UploadPanel onUploadComplete={handleUploadComplete} />
                </div>
                <PrimaryButton onClick={() => setAddLoadOpen(true)} className="shrink-0">
                  + Add Load
                </PrimaryButton>
              </div>
              <LoadsTable
                refreshKey={refreshKey}
                onSelectLoad={setSelectedLoad}
                onOpenBlast={(load, showRate) => setBlastTarget({ load, showRate })}
                onViewMatches={handleViewMatches}
              />
              <DatExportSection refreshKey={refreshKey} />
            </motion.main>
          )}
          {tab === 'inquiries' && (
            <motion.main key="inquiries" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
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
            <motion.main key="carriers-manage" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
              <CarriersViewToggle carriersView={carriersView} onChange={setCarriersView} />
              <CarriersPanel />
            </motion.main>
          )}
          {tab === 'carriers' && carriersView === 'find' && (
            <motion.main key="carriers-find" {...preset.crossfade} className="relative h-[calc(100vh-3.75rem)] w-full overflow-hidden">
              <CarrierMapPage focusedLoad={focusedMatchLoad} />
              {/* Floats over the globe instead of sitting in a separate header
                  strip above it, so the whole tab reads as one continuous
                  canvas rather than chrome-then-a-boxed-panel. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-black/50 to-transparent p-4 sm:px-6">
                <div className="pointer-events-auto flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">Carriers</h1>
                  <CarriersViewToggle carriersView={carriersView} onChange={setCarriersView} />
                </div>
                {focusedMatchLoad && (
                  <SecondaryButton onClick={() => setFocusedMatchLoad(null)} className="pointer-events-auto px-3 py-1.5 text-xs">
                    ← Clear load, search any lane
                  </SecondaryButton>
                )}
              </div>
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
