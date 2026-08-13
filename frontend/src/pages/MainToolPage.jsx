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
import InquiriesStatsRow from '../components/InquiriesStatsRow';
import DatExportSection from '../components/DatExportSection';
import SecondaryButton from '../components/SecondaryButton';
import Sidebar from '../components/Sidebar';
import AuroraBackground from '../components/AuroraBackground';
import { useInquiryAlerts } from '../components/InquiryAlertBanner';
import { subscribe } from '../lib/liveSocket';
import { useMotionPreset } from '../lib/motionConfig';

const TAB_TITLES = {
  loads: 'Loads',
  inquiries: 'Inquiries',
};

function MainToolPage({ username, onLogout }) {
  const [tab, setTab] = useState('loads'); // 'loads' | 'inquiries'
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [addLoadOpen, setAddLoadOpen] = useState(false);
  const [blastTarget, setBlastTarget] = useState(null);
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

  useEffect(() => {
    return subscribe('inquiry:new', (inquiry) => {
      pushAlert(`New inquiry from ${inquiry.from_address}`, {
        onView: () => setTab('inquiries'),
      });
    });
  }, [pushAlert]);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-shell-bg text-shell-text">
      <AuroraBackground />
      {inquiryAlertViewport}
      <Sidebar tab={tab} onTabChange={setTab} username={username} onLogout={onLogout} />
      <div className="relative z-10 min-w-0 flex-1">
        <header className="px-8 pt-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-shell-text">{TAB_TITLES[tab]}</h1>
        </header>
        <AnimatePresence>
          {tab === 'loads' && (
            <motion.main key="loads" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-8">
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
              />
              <DatExportSection
                refreshKey={refreshKey}
                onOpenBlast={(load, showRate) => setBlastTarget({ load, showRate })}
              />
            </motion.main>
          )}
          {tab === 'inquiries' && (
            <motion.main key="inquiries" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-8">
              <div className="flex justify-end">
                <SecondaryButton onClick={() => setInquiriesRefreshKey((k) => k + 1)} className="px-4 py-2 text-xs">
                  Refresh
                </SecondaryButton>
              </div>
              <InquiriesStatsRow refreshKey={inquiriesRefreshKey} />
              <GmailConnectionPanel />
              <ReviewQueue key={`review-${inquiriesRefreshKey}`} />
              <InquiriesLog refreshKey={inquiriesRefreshKey} />
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
