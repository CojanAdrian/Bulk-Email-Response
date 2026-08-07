import { useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import RateModal from '../components/RateModal';

function MainToolPage({ username, onLogout }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLoad, setSelectedLoad] = useState(null);

  function handleUploadComplete() {
    setRefreshKey((k) => k + 1);
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">BulkPosting</h1>
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
      <main className="space-y-6 p-6">
        <UploadPanel onUploadComplete={handleUploadComplete} />
        <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
      </main>
      {selectedLoad && (
        <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}

export default MainToolPage;
