import { useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import RateModal from '../components/RateModal';
import GmailConnectionPanel from '../components/GmailConnectionPanel';
import ReviewQueue from '../components/ReviewQueue';
import InquiriesLog from '../components/InquiriesLog';
import DatExportSection from '../components/DatExportSection';
import ThemeToggle from '../components/ThemeToggle';
import SecondaryButton from '../components/SecondaryButton';

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
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-between border-b-[3px] border-b-gold bg-gradient-to-br from-[var(--color-accent-strong)] to-[var(--color-accent)] px-6 py-4 shadow-md">
        <div className="flex items-center gap-6">
          <h1 className="bg-gradient-to-r from-gold-light to-gold bg-clip-text text-lg font-extrabold tracking-wide text-transparent">
            BulkPosting
          </h1>
          <nav className="flex gap-1 text-sm">
            <button
              onClick={() => setTab('loads')}
              aria-current={tab === 'loads' ? 'page' : undefined}
              className={`rounded-lg px-3 py-1 transition-colors ${
                tab === 'loads' ? 'bg-white/10 text-gold-light' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              Loads
            </button>
            <button
              onClick={() => setTab('inquiries')}
              aria-current={tab === 'inquiries' ? 'page' : undefined}
              className={`rounded-lg px-3 py-1 transition-colors ${
                tab === 'inquiries' ? 'bg-white/10 text-gold-light' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              Inquiries
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-white/80">
          <ThemeToggle />
          <span>{username}</span>
          <button onClick={onLogout} className="rounded-lg border border-white/30 px-3 py-1 hover:bg-white/10">
            Log out
          </button>
        </div>
      </header>
      {tab === 'loads' && (
        <main className="mx-auto max-w-[1400px] space-y-6 p-6">
          <UploadPanel onUploadComplete={handleUploadComplete} />
          <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
          <DatExportSection refreshKey={refreshKey} />
        </main>
      )}
      {tab === 'inquiries' && (
        <main className="mx-auto max-w-[1400px] space-y-6 p-6">
          <div className="flex justify-end">
            <SecondaryButton onClick={() => setInquiriesRefreshKey((k) => k + 1)} className="px-3 py-1">
              Refresh
            </SecondaryButton>
          </div>
          <GmailConnectionPanel />
          <ReviewQueue key={`review-${inquiriesRefreshKey}`} />
          <InquiriesLog refreshKey={inquiriesRefreshKey} />
        </main>
      )}
      {selectedLoad && (
        <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}

export default MainToolPage;
