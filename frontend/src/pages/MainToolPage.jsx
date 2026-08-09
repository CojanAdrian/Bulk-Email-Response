import { useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import RateModal from '../components/RateModal';
import GmailConnectionPanel from '../components/GmailConnectionPanel';
import ReviewQueue from '../components/ReviewQueue';
import InquiriesLog from '../components/InquiriesLog';

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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">BulkPosting</h1>
          <nav className="flex gap-1 text-sm">
            <button
              onClick={() => setTab('loads')}
              aria-current={tab === 'loads' ? 'page' : undefined}
              className={`rounded-lg px-3 py-1 ${
                tab === 'loads' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              Loads
            </button>
            <button
              onClick={() => setTab('inquiries')}
              aria-current={tab === 'inquiries' ? 'page' : undefined}
              className={`rounded-lg px-3 py-1 ${
                tab === 'inquiries' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              Inquiries
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{username}</span>
          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>
      {tab === 'loads' && (
        <main className="space-y-6 p-6">
          <UploadPanel onUploadComplete={handleUploadComplete} />
          <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
        </main>
      )}
      {tab === 'inquiries' && (
        <main className="space-y-6 p-6">
          <div className="flex justify-end">
            <button
              onClick={() => setInquiriesRefreshKey((k) => k + 1)}
              className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
            >
              Refresh
            </button>
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
