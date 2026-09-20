import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';

function loadLabel(load) {
  const lane = load.origin_city && load.dest_city
    ? `${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state}`
    : 'No lane on file';
  return `${load.load_number} — ${lane}`;
}

function matchesQuery(load, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const haystack = `${load.load_number} ${load.origin_city || ''} ${load.origin_state || ''} ${load.dest_city || ''} ${load.dest_state || ''}`.toLowerCase();
  return haystack.includes(q);
}

// A searchable dropdown over the current user's active loads, matching on
// load number, origin, or destination -- used by ReviewQueue to re-assign
// an inquiry to a different load when the automatic match picked the
// wrong one.
function LoadPicker({ ariaLabel, onSelect, autoFocus = false }) {
  const [loads, setLoads] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [query, setQuery] = useState('');

  useEffect(() => {
    let ignore = false;
    listLoads('active')
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!ignore) setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, []);

  const results = loads.filter((load) => matchesQuery(load, query));

  return (
    <div>
      <input
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by load #, city, or state"
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
      />
      {status === 'loading' && <p className="mt-1 text-xs text-text-muted">Loading loads...</p>}
      {status === 'error' && <p className="mt-1 text-xs text-error">Failed to load your active loads.</p>}
      {status === 'ready' && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">No matching loads</li>}
          {results.map((load) => (
            <li key={load.id}>
              <button
                type="button"
                onClick={() => onSelect(load)}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-alt"
              >
                {loadLabel(load)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LoadPicker;
