import { useEffect, useState } from 'react';
import { getLoadsStats } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import { STATS_PRESETS, rangeForPreset } from '../lib/statsDateRanges';
import Card from '../components/Card';
import StatTile from '../components/StatTile';
import Skeleton from '../components/Skeleton';

const SORT_COLUMNS = [
  { key: 'booked_at', label: 'Booked' },
  { key: 'load_number', label: 'Load #' },
  { key: 'ran_at', label: 'Date' },
  { key: 'target_pay', label: 'Target Pay' },
  { key: 'rate', label: 'Rate' },
  { key: 'gp', label: 'GP' },
];

// "Oct 17, 3:24 PM" -- the moment the load was marked booked.
function formatBookedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function money(value) {
  return value === null || value === undefined ? '—' : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
          className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:min-h-0 ${
            !usingCustomRange && preset === p.key ? 'bg-accent text-accent-ink' : 'border border-border bg-surface-alt text-text-muted hover:text-text'
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex min-w-0 items-center gap-2 text-xs text-text-muted sm:ml-2">
        <input
          type="date"
          aria-label="Custom from date"
          value={customFrom}
          onChange={(e) => onCustomChange('from', e.target.value)}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface-alt px-3 py-1.5 text-text sm:flex-none"
        />
        <span>to</span>
        <input
          type="date"
          aria-label="Custom to date"
          value={customTo}
          onChange={(e) => onCustomChange('to', e.target.value)}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface-alt px-3 py-1.5 text-text sm:flex-none"
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
  const [sort, setSort] = useState({ key: 'booked_at', direction: 'desc' });
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

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatTile label="Loads booked" value={data ? data.totals.count : '—'} />
        <StatTile label="Total GP" value={data ? money(data.totals.totalGp) : '—'} accentClassName="text-success" />
        <StatTile label="Total rate paid" value={data ? money(data.totals.totalRate) : '—'} />
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text">Booked loads</h2>
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
          <>
            <div role="group" aria-label="Sort booked loads" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="mr-0.5 text-text-muted">Sort</span>
              {SORT_COLUMNS.map((col) => {
                const active = sort.key === col.key;
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => handleSortClick(col.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold transition ${
                      active ? 'bg-text text-surface' : 'text-text-muted hover:bg-surface-alt hover:text-text'
                    }`}
                  >
                    {col.label}
                    {active && <span aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                );
              })}
            </div>
            <ul aria-label="Booked loads" className="space-y-2">
              {data.loads.map((load) => (
                <li key={load.id} className="min-w-0 rounded-2xl border border-border bg-surface-alt/60 p-3 text-sm text-text">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                      {load.origin_city}, {load.origin_state}
                      <span aria-label="to" className="mx-1.5 text-text-muted">→</span>
                      {load.dest_city}, {load.dest_state}
                    </p>
                    <p className="shrink-0 text-xs text-text-muted">
                      <span className="font-semibold text-text">{load.load_number}</span> ·{' '}
                      <time dateTime={load.booked_at || undefined} title="When it was marked booked">
                        Booked {formatBookedAt(load.booked_at)}
                      </time>
                    </p>
                  </div>
                  {(load.customer || load.load_type) && (
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {[load.customer, load.load_type === 'contract' ? 'Contract' : load.load_type === 'spot' ? 'Spot' : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="min-w-0">
                      <dt className="text-text-muted">Carrier</dt>
                      <dd className="truncate font-semibold" title={load.carrier_name || ''}>{load.carrier_name || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Target pay</dt>
                      <dd className="font-semibold tabular-nums">{money(load.target_pay)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Rate</dt>
                      <dd className="font-semibold tabular-nums">{money(load.rate)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Gross profit</dt>
                      <dd className="font-semibold tabular-nums text-success">{money(load.gp)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

export default StatsPage;
