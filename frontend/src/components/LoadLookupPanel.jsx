import { useState } from 'react';
import { searchLoads, buildLookupMessage, detectMultiStop } from '../lib/lookupMessage';

function LoadLookupPanel({ loads, onOpenBlast }) {
  const [query, setQuery] = useState('');
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [showRate, setShowRate] = useState(false);
  const [copied, setCopied] = useState(false);

  const results = searchLoads(loads, query);

  function handleSelect(load) {
    setSelectedLoad(load);
    setCopied(false);
  }

  function handleCopy() {
    const text = buildLookupMessage(selectedLoad, showRate);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  }

  const multiStopWarning = selectedLoad ? detectMultiStop(selectedLoad) : null;
  const message = selectedLoad ? buildLookupMessage(selectedLoad, showRate) : '';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Load Detail Lookup</h2>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Order #, city, or state…"
        aria-label="Search loads"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
      />
      {query.trim() !== '' && (
        <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-slate-800">
          {results.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No loads match.</p>
          ) : (
            results.map((load) => (
              <button
                key={load.id}
                onClick={() => handleSelect(load)}
                className={`block w-full border-b border-slate-800/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-800 ${
                  selectedLoad && selectedLoad.id === load.id ? 'bg-slate-800' : ''
                }`}
              >
                <div className="font-semibold text-slate-100">
                  {load.load_number} — {load.equipment}
                </div>
                <div className="text-xs text-slate-400">
                  {load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {!selectedLoad && <p className="text-sm text-slate-500">Select a load above.</p>}

      {selectedLoad && (
        <div className="border-t border-slate-800 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order {selectedLoad.load_number} — {selectedLoad.origin_city}, {selectedLoad.origin_state} → {selectedLoad.dest_city},{' '}
            {selectedLoad.dest_state}
          </div>
          <textarea
            value={message}
            readOnly
            aria-label="Email message"
            rows={6}
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={showRate} onChange={(e) => setShowRate(e.target.checked)} />
              {showRate ? 'Rate shown' : 'Rate hidden'}
            </label>
            <button onClick={handleCopy} className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800">
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
            {onOpenBlast && (
              <button
                onClick={() => onOpenBlast(selectedLoad, showRate)}
                className="ml-auto rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Blast email
              </button>
            )}
          </div>
          {multiStopWarning && (
            <div className="mb-3 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
              ⚠ {multiStopWarning} — add additional stop info manually before sending
            </div>
          )}
          {selectedLoad.comment && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Planning Comment</div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">{selectedLoad.comment}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LoadLookupPanel;
