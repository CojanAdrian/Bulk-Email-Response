import { useEffect, useState } from 'react';
import { getLoadsStats } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import { STATS_PRESETS, rangeForPreset } from '../lib/statsDateRanges';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';

const SORT_COLUMNS = [
  { key: 'load_number', label: 'Load #' },
  { key: 'ran_at', label: 'Date' },
  { key: 'target_pay', label: 'Target Pay' },
  { key: 'rate', label: 'Rate' },
  { key: 'gp', label: 'GP' },
];

function money(value) {
  return value === null || value === undefined ? '—' : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function StatBlock({ label, value }) {
  return (
    <Card className="!p-4 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-text">{value}</p>
    </Card>
  );
}

// The date range is either one of the trailing-window presets (today,
// yesterday, last 3 days, ...) or a fully custom from/to pair -- switching
// either one clears the other's "active" state, same as a single select.
function DateRangeControls({ preset, onPresetChange, customFrom, customTo, onCustomChange, usingCustomRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATS_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPresetChange(p.key)}
          aria-pressed={!usingCustomRange && preset === p.key}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            !usingCustomRange && preset === p.key ? 'bg-accent text-accent-ink' : 'border border-border text-text-muted hover:text-text'
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="ml-2 flex items-center gap-2 text-xs text-text-muted">
        <input
          type="date"
          aria-label="Custom from date"
          value={customFrom}
          onChange={(e) => onCustomChange('from', e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-text"
        />
        <span>to</span>
        <input
          type="date"
          aria-label="Custom to date"
          value={customTo}
          onChange={(e) => onCustomChange('to', e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-text"
        />
      </div>
    </div>
  );
}

// Booked loads with the rate/gp logged for them, with quick date-range
// filtering (today/yesterday/trailing windows, or a fully custom range)
// and summary totals up top -- so "how have I done this week" is a couple
// of clicks, not a spreadsheet.
function StatsPage() {
  const [preset, setPreset] = useState('lastWeek');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [usingCustomRange, setUsingCustomRange] = useState(false);
  const [sort, setSort] = useState({ key: 'ran_at', direction: 'desc' });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [liveTick, setLiveTick] = useState(0);

  const range = usingCustomRange ? { from: customFrom || null, to: customTo || null } : rangeForPreset(preset);

  useEffect(() => {
    let ignore = false;
    setStatus('loading');
    setError(null);
    getLoadsStats({ from: range.from, to: range.to, sort: sort.key, direction: sort.direction })
      .then((res) => {
        if (!ignore) {
          setData(res);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load stats.');
          setStatus('error');
        }
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, sort.key, sort.direction, liveTick]);

  useEffect(() => {
    return subscribe('load:changed', () => setLiveTick((t) => t + 1));
  }, []);

  function handlePresetChange(key) {
    setUsingCustomRange(false);
    setPreset(key);
  }

  function handleCustomChange(field, value) {
    setUsingCustomRange(true);
    if (field === 'from') setCustomFrom(value);
    else setCustomTo(value);
  }

  function handleSortClick(key) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' }));
  }

  return (
    <div className="space-y-6">
      <DateRangeControls
        preset={preset}
        onPresetChange={handlePresetChange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={handleCustomChange}
        usingCustomRange={usingCustomRange}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBlock label="Loads booked" value={data ? data.totals.count : '—'} />
        <StatBlock label="Total GP" value={data ? money(data.totals.totalGp) : '—'} />
        <StatBlock label="Total rate paid" value={data ? money(data.totals.totalRate) : '—'} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-text">Booked loads</h2>
        {status === 'loading' && <Skeleton count={4} height="1.75rem" />}
        {status === 'error' && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {status === 'ready' && data.loads.length === 0 && (
          <p className="text-sm text-text-muted">No booked loads in this period.</p>
        )}
        {status === 'ready' && data.loads.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-text">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  {SORT_COLUMNS.map((col) => (
                    <th key={col.key} className="py-1.5 pr-4">
                      <button
                        type="button"
                        onClick={() => handleSortClick(col.key)}
                        className="flex items-center gap-1 font-medium text-text-muted hover:text-text"
                      >
                        {col.label}
                        {sort.key === col.key && <span aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  ))}
                  <th className="py-1.5 pr-4">Origin</th>
                  <th className="py-1.5 pr-4">Destination</th>
                  <th className="py-1.5 pr-4">Carrier</th>
                </tr>
              </thead>
              <tbody>
                {data.loads.map((load) => (
                  <tr key={load.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-4">{load.load_number}</td>
                    <td className="py-1.5 pr-4">{load.booked_date}</td>
                    <td className="py-1.5 pr-4">{money(load.target_pay)}</td>
                    <td className="py-1.5 pr-4">{money(load.rate)}</td>
                    <td className="py-1.5 pr-4">{money(load.gp)}</td>
                    <td className="py-1.5 pr-4">
                      {load.origin_city}, {load.origin_state}
                    </td>
                    <td className="py-1.5 pr-4">
                      {load.dest_city}, {load.dest_state}
                    </td>
                    <td className="py-1.5 pr-4">{load.carrier_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default StatsPage;
