import { useState } from 'react';
import { searchLoads, buildLookupMessage, detectMultiStop } from '../lib/lookupMessage';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';

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
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-text">Load Detail Lookup</h2>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Order #, city, or state…"
        aria-label="Search loads"
        className="mb-3 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
      />
      {query.trim() !== '' && (
        <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-border">
          {results.length === 0 ? (
            <p className="p-3 text-sm text-text-muted">No loads match.</p>
          ) : (
            results.map((load) => (
              <button
                key={load.id}
                onClick={() => handleSelect(load)}
                className={`block w-full border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-alt ${
                  selectedLoad && selectedLoad.id === load.id ? 'bg-surface-alt' : ''
                }`}
              >
                <div className="font-semibold text-text">
                  {load.load_number} — {load.equipment}
                </div>
                <div className="text-xs text-text-muted">
                  {load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {!selectedLoad && <p className="text-sm text-text-muted">Select a load above.</p>}

      {selectedLoad && (
        <div className="border-t border-border pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Order {selectedLoad.load_number} — {selectedLoad.origin_city}, {selectedLoad.origin_state} → {selectedLoad.dest_city},{' '}
            {selectedLoad.dest_state}
          </div>
          <textarea
            value={message}
            readOnly
            aria-label="Email message"
            rows={6}
            className="mb-3 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={showRate} onChange={(e) => setShowRate(e.target.checked)} />
              {showRate ? 'Rate shown' : 'Rate hidden'}
            </label>
            <SecondaryButton onClick={handleCopy} className="px-3 py-1">
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </SecondaryButton>
            {onOpenBlast && (
              <PrimaryButton onClick={() => onOpenBlast(selectedLoad, showRate)} className="ml-auto px-3 py-1">
                Blast email
              </PrimaryButton>
            )}
          </div>
          {multiStopWarning && (
            <div className="mb-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
              ⚠ {multiStopWarning} — add additional stop info manually before sending
            </div>
          )}
          {selectedLoad.comment && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Planning Comment</div>
              <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text">{selectedLoad.comment}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default LoadLookupPanel;
