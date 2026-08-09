import { useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import RateModal from '../components/RateModal';
import GmailConnectionPanel from '../components/GmailConnectionPanel';
import ReviewQueue from '../components/ReviewQueue';
import InquiriesLog from '../components/InquiriesLog';
import DatExportSection from '../components/DatExportSection';
import SecondaryButton from '../components/SecondaryButton';
import Sidebar from '../components/Sidebar';

const TAB_TITLES = {
  loads: 'Loads',
  inquiries: 'Inquiries',
};

function MainToolPage({ username, onLogout }) {
  const [tab, setTab] = useState('loads'); // 'loads' | 'inquiries'
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [inquiriesRefreshKey, setInquiriesRefreshKey] = useState(0);

  function handleUploadComplete() {
    setRefreshKey((k) => k + 1);
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex min-h-screen bg-shell-bg text-shell-text">
      <Sidebar tab={tab} onTabChange={setTab} username={username} onLogout={onLogout} />
      <div className="min-w-0 flex-1">
        <header className="px-8 pt-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-shell-text">{TAB_TITLES[tab]}</h1>
        </header>
        {tab === 'loads' && (
          <main className="mx-auto max-w-[1400px] space-y-6 p-8">
            <UploadPanel onUploadComplete={handleUploadComplete} />
            <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
            <DatExportSection refreshKey={refreshKey} />
          </main>
        )}
        {tab === 'inquiries' && (
          <main className="mx-auto max-w-[1400px] space-y-6 p-8">
            <div className="flex justify-end">
              <SecondaryButton onClick={() => setInquiriesRefreshKey((k) => k + 1)} className="px-4 py-2 text-xs">
                Refresh
              </SecondaryButton>
            </div>
            <GmailConnectionPanel />
            <ReviewQueue key={`review-${inquiriesRefreshKey}`} />
            <InquiriesLog refreshKey={inquiriesRefreshKey} />
          </main>
        )}
      </div>
      {selectedLoad && (
        <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}

export default MainToolPage;
