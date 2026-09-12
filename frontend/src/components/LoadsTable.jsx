import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { bulkCarrierMatches } from '../api/carrierMatches';
import { subscribe } from '../lib/liveSocket';
import { multiStopTagVariant, buildLookupMessage } from '../lib/lookupMessage';
import { buildPUSched } from '../lib/datExport';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../lib/dateInput';
import { useSelectionMode } from '../lib/useSelectionMode';
import Badge from './Badge';
import BookingCarrierModal from './BookingCarrierModal';
import BottomActionBar from './BottomActionBar';
import Card from './Card';
import Skeleton from './Skeleton';
import DateRangeField from './DateRangeField';
import SelectionCircle from './SelectionCircle';

const STATUS_OPTIONS = ['active', 'booked', 'covered'];
const STATUS_LABELS = { active: 'Active', booked: 'Booked', covered: 'Covered' };
// A compact tag in the row's own left-edge column (see the match indicator
// below) instead of a wide "N carriers match" pill inline next to the load
// number -- moved out of the way of Load #/Origin, but still a readable
// tag (count + "match"/"matches"), not a bare unlabeled circle.
const MATCH_BADGE_VARIANT = { perfect: 'success', strong: 'info', weak: 'warning', regional_perfect: 'success', regional: 'default' };

const SORT_COLUMNS = [
  { key: 'load_number', label: 'Load #' },
  { key: 'origin', label: 'Origin' },
  { key: 'destination', label: 'Destination' },
  { key: 'pu', label: 'PU' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'target_pay', label: 'Target Pay' },
];

function sortValue(load, key) {
  switch (key) {
    case 'load_number':
      return String(load.load_number ?? '');
    // Sorted by state first, then city -- groups loads by state (what the
    // user asked for) while still alphabetizing cities within each state.
    case 'origin':
      return `${load.origin_state ?? ''} ${load.origin_city ?? ''}`.trim();
    case 'destination':
      return `${load.dest_state ?? ''} ${load.dest_city ?? ''}`.trim();
    // Sorts by whichever PU time is set (earliest if both are), so loads
    // with no PU time at all sort as if earliest (matches target_pay's
    // "missing sorts as 0" convention below).
    case 'pu': {
      const raw = load.early_pu ?? load.late_pu;
      const t = raw ? new Date(raw).getTime() : NaN;
      return Number.isNaN(t) ? 0 : t;
    }
    case 'equipment':
      return String(load.equipment ?? '');
    case 'target_pay':
      return Number(load.target_pay ?? 0);
    default:
      return '';
  }
}

function matchesSearch(load, query) {
  if (!query) return true;
  const haystack = `${load.load_number ?? ''} ${load.origin_city ?? ''} ${load.origin_state ?? ''} ${load.dest_city ?? ''} ${load.dest_state ?? ''}`.toLowerCase();
  return haystack.includes(query);
}

function sortLoads(loads, sort) {
  if (!sort.key) return loads;
  const sorted = [...loads].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sort.direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// The Loads/Inquiries tabs unmount this table (see MainToolPage), which
// would otherwise reset the sort back to unsorted every time the user
// switches tabs and comes back -- persist it across that, and across full
// page reloads, the same way useTheme persists the color theme.
const SORT_STORAGE_KEY = 'loadsTable.sort';

function getInitialSort() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY));
    if (parsed && (parsed.direction === 'asc' || parsed.direction === 'desc')) {
      return { key: parsed.key ?? null, direction: parsed.direction };
    }
  } catch {
    // malformed or inaccessible storage -- fall back to the default below
  }
  return { key: null, direction: 'asc' };
}

function LoadsTable({ refreshKey, onSelectLoad, onOpenBlast, onViewMatches }) {
  const [loads, setLoads] = useState([]);
  const [matchInfo, setMatchInfo] = useState({});
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  const [liveTick, setLiveTick] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [busyLoadId, setBusyLoadId] = useState(null);
  const [bookingModalLoad, setBookingModalLoad] = useState(null);
  const [sort, setSort] = useState(getInitialSort);
  const selection = useSelectionMode();
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingTargetPayId, setEditingTargetPayId] = useState(null);
  const [targetPayDraft, setTargetPayDraft] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  // Staged PU edits, keyed by load id -- DateRangeField's early/late values
  // are normally driven straight from `load.early_pu`/`late_pu`, but that
  // only updates once a fetch round-trips back from the server. Without
  // this, picking a day and then a time in the same popover session (two
  // separate saves) would have the second save read the date as still
  // unset, since the row's own data hasn't refreshed yet -- silently
  // reverting the date. Cleared whenever a fresh fetch resolves, once the
  // server data is authoritative again.
  const [puOverrides, setPuOverrides] = useState({});

  useEffect(() => {
    let ignore = false;
    setStatus('loading');
    setError(null);
    listLoads(statusFilter)
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setStatus('ready');
          selection.exit();
          setPuOverrides({});
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load loads.');
          setStatus('error');
        }
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, statusFilter, liveTick]);

  useEffect(() => {
    return subscribe('load:changed', () => setLiveTick((t) => t + 1));
  }, []);

  useEffect(() => {
    if (loads.length === 0) {
      setMatchInfo({});
      return undefined;
    }
    let ignore = false;
    bulkCarrierMatches(loads.map((load) => load.id))
      .then((data) => {
        if (!ignore) setMatchInfo(data);
      })
      .catch(() => {
        // Best-effort -- a failed match lookup shouldn't block the table
        // itself from rendering; the badge just doesn't show.
      });
    return () => {
      ignore = true;
    };
  }, [loads]);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  }, [sort]);

  const filteredLoads = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return q ? loads.filter((load) => matchesSearch(load, q)) : loads;
  }, [loads, searchText]);

  const sortedLoads = useMemo(() => sortLoads(filteredLoads, sort), [filteredLoads, sort]);

  function handleSortClick(key) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  }

  function handleStatusChange(load, newStatus) {
    setActionError(null);
    setBusyLoadId(load.id);
    updateLoad(load.id, { status: newStatus })
      .then(() => {
        if (newStatus === 'booked' && load.status !== 'booked') {
          setBookingModalLoad(load);
        }
      })
      .catch((err) => {
        setActionError(err.message || 'Failed to update status.');
      })
      .finally(() => {
        setBusyLoadId(null);
      });
  }

  function handleDelete(load) {
    setActionError(null);
    setBusyLoadId(load.id);
    deleteLoad(load.id)
      .then(() => {
        setConfirmingDeleteId(null);
      })
      .catch((err) => {
        setActionError(err.message || 'Failed to delete load.');
      })
      .finally(() => {
        setBusyLoadId(null);
      });
  }

  function handleBulkStatusChange(e) {
    const newStatus = e.target.value;
    if (!newStatus) return;
    setActionError(null);
    setBulkBusy(true);
    bulkUpdateLoadStatus(Array.from(selection.selectedIds), newStatus)
      .then(() => {
        selection.exit();
      })
      .catch((err) => setActionError(err.message || 'Failed to update selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }

  function handleIncludeRateChange(load, checked) {
    setActionError(null);
    setBusyLoadId(load.id);
    updateLoad(load.id, { include_rate: checked })
      .catch((err) => {
        setActionError(err.message || 'Failed to update rate.');
      })
      .finally(() => {
        setBusyLoadId(null);
      });
  }

  function handleBulkIncludeRate(e) {
    const value = e.target.value;
    if (!value) return;
    setActionError(null);
    setBulkBusy(true);
    bulkSetIncludeRate(Array.from(selection.selectedIds), value === 'include')
      .then(() => {
        selection.exit();
      })
      .catch((err) => setActionError(err.message || 'Failed to update rate for selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }

  function handleBulkDelete() {
    setActionError(null);
    setBulkBusy(true);
    bulkDeleteLoads(Array.from(selection.selectedIds))
      .then(() => {
        selection.exit();
        setConfirmingBulkDelete(false);
      })
      .catch((err) => setActionError(err.message || 'Failed to delete selected loads.'))
      .finally(() => setBulkBusy(false));
  }

  function startEditTargetPay(load) {
    setEditingTargetPayId(load.id);
    setTargetPayDraft(load.target_pay ?? '');
  }

  function saveTargetPay(load) {
    if (editingTargetPayId !== load.id) return; // already saved (Enter) or cancelled (Escape)
    const trimmed = String(targetPayDraft).trim();
    let normalized = null;
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) {
        setActionError('Target pay must be a number.');
        setEditingTargetPayId(null);
        return;
      }
      normalized = parsed;
    }
    setActionError(null);
    setEditingTargetPayId(null);
    setBusyLoadId(load.id);
    updateLoad(load.id, { target_pay: normalized })
      .catch((err) => setActionError(err.message || 'Failed to update target pay.'))
      .finally(() => setBusyLoadId(null));
  }

  function handleTargetPayKeyDown(e, load) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTargetPay(load);
    } else if (e.key === 'Escape') {
      setEditingTargetPayId(null);
    }
  }

  function puValuesFor(load) {
    return (
      puOverrides[load.id] ?? {
        early_pu: isoToDatetimeLocal(load.early_pu),
        late_pu: isoToDatetimeLocal(load.late_pu),
      }
    );
  }

  function handlePuChange(load, field, datetimeLocalValue) {
    setPuOverrides((prev) => ({
      ...prev,
      [load.id]: { ...puValuesFor(load), [field]: datetimeLocalValue },
    }));
    setActionError(null);
    setBusyLoadId(load.id);
    updateLoad(load.id, { [field]: datetimeLocalToMysql(datetimeLocalValue) })
      .catch((err) => setActionError(err.message || 'Failed to update pickup window.'))
      .finally(() => setBusyLoadId(null));
  }

  function handleCopy(load) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    const text = buildLookupMessage(load, Boolean(load.include_rate));
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(load.id);
      setTimeout(() => setCopiedId((prev) => (prev === load.id ? null : prev)), 1800);
    });
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text">Loads</h2>
          {sortedLoads.length > 0 && (
            selection.active ? (
              <div className="flex items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => selection.selectAll(sortedLoads.map((l) => l.id))}
                  className="rounded-lg border border-border bg-surface px-3 py-1 text-text hover:bg-surface-alt"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={selection.exit}
                  className="rounded-lg border border-border bg-surface px-3 py-1 text-text hover:bg-surface-alt"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={selection.enter}
                className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-text hover:bg-surface-alt"
              >
                Select
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search loads"
            placeholder="Search load #, city, state..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-48 rounded-lg border border-border bg-surface-alt px-2 py-1 text-sm text-text sm:w-64"
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-sm text-text"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {status === 'loading' && <Skeleton count={4} height="1.75rem" />}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-3 text-sm text-error">
          {actionError}
        </p>
      )}
      <BottomActionBar count={selection.selectedIds.size}>
        <select
          aria-label="Mark selected as"
          defaultValue=""
          onChange={handleBulkStatusChange}
          disabled={bulkBusy}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
        >
          <option value="" disabled>
            Mark as...
          </option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          aria-label="Rate for selected"
          defaultValue=""
          onChange={handleBulkIncludeRate}
          disabled={bulkBusy}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
        >
          <option value="" disabled>
            Rate...
          </option>
          <option value="include">Include rate</option>
          <option value="exclude">Exclude rate</option>
        </select>
        {confirmingBulkDelete ? (
          <>
            <span className="text-xs text-error">Delete {selection.selectedIds.size}?</span>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {bulkBusy ? 'Deleting...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmingBulkDelete(false)}
              disabled={bulkBusy}
              className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingBulkDelete(true)}
            disabled={bulkBusy}
            className="rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg disabled:opacity-60"
          >
            Delete selected
          </button>
        )}
        <button
          onClick={selection.clear}
          disabled={bulkBusy}
          className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
        >
          Clear selection
        </button>
      </BottomActionBar>
      {status === 'ready' && loads.length === 0 && <p className="text-sm text-text-muted">No loads found.</p>}
      {status === 'ready' && loads.length > 0 && sortedLoads.length === 0 && (
        <p className="text-sm text-text-muted">No loads match "{searchText}".</p>
      )}
      {status === 'ready' && sortedLoads.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-text">
          <thead className="bg-surface">
            <tr className="border-b border-border text-text-muted">
              <th className="w-8 py-1.5 pr-2" />
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
              <th className="py-1.5 pr-4">Rate</th>
              <th className="py-1.5 pr-4">Status</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {sortedLoads.map((load) => (
              <tr key={load.id} className="border-b border-border/60">
                <td className="py-1.5 pr-2">
                  {selection.active ? (
                    <SelectionCircle
                      selected={selection.isSelected(load.id)}
                      onToggle={() => selection.toggle(load.id)}
                      ariaLabel={`Select ${load.load_number}`}
                    />
                  ) : (
                    matchInfo[load.id] && (
                      <button type="button" onClick={() => onViewMatches && onViewMatches(load)} className="cursor-pointer border-0 bg-transparent p-0">
                        <Badge variant={MATCH_BADGE_VARIANT[matchInfo[load.id].tier] || 'default'} className="max-w-[4.5rem]">
                          {matchInfo[load.id].count} match{matchInfo[load.id].count === 1 ? '' : 'es'}
                        </Badge>
                      </button>
                    )
                  )}
                </td>
                <td className="py-1.5 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span>{load.load_number}</span>
                    {Boolean(load.custom_reply_body) && <Badge variant="warning">Modified</Badge>}
                    {multiStopTagVariant(load) === 'error' && <Badge variant="error" className="max-w-[5rem]">Needs stops added</Badge>}
                    {multiStopTagVariant(load) === 'info' && <Badge variant="info" className="max-w-[5rem]">Stops added</Badge>}
                  </div>
                </td>
                <td className="py-1.5 pr-4">
                  {load.origin_city}, {load.origin_state}
                </td>
                <td className="py-1.5 pr-4">
                  {load.dest_city}, {load.dest_state}
                </td>
                <td className="py-1.5 pr-4 whitespace-nowrap">
                  <DateRangeField
                    legend="PU"
                    showLegend={false}
                    earlyId={`pu-early-${load.id}`}
                    lateId={`pu-late-${load.id}`}
                    earlyValue={puValuesFor(load).early_pu}
                    lateValue={puValuesFor(load).late_pu}
                    onEarlyChange={(value) => handlePuChange(load, 'early_pu', value)}
                    onLateChange={(value) => handlePuChange(load, 'late_pu', value)}
                    formatRange={buildPUSched}
                  />
                </td>
                <td className="py-1.5 pr-4">{load.equipment}</td>
                <td className="py-1.5 pr-4">
                  {editingTargetPayId === load.id ? (
                    <input
                      type="number"
                      step="0.01"
                      autoFocus
                      aria-label={`Target pay for ${load.load_number}`}
                      value={targetPayDraft}
                      onChange={(e) => setTargetPayDraft(e.target.value)}
                      onBlur={() => saveTargetPay(load)}
                      onKeyDown={(e) => handleTargetPayKeyDown(e, load)}
                      className="w-24 rounded-lg border border-border bg-surface-alt px-2 py-1 text-sm text-text"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditTargetPay(load)}
                      className="rounded-lg border border-transparent px-2 py-1 text-left hover:border-border hover:bg-surface-alt"
                    >
                      {load.target_pay ?? '—'}
                    </button>
                  )}
                </td>
                <td className="py-1.5 pr-4">
                  <input
                    type="checkbox"
                    aria-label={`Include rate for ${load.load_number}`}
                    checked={Boolean(load.include_rate)}
                    onChange={(e) => handleIncludeRateChange(load, e.target.checked)}
                    disabled={busyLoadId === load.id}
                  />
                </td>
                <td className="py-1.5 pr-4">
                  <select
                    aria-label={`Status for ${load.load_number}`}
                    value={load.status}
                    onChange={(e) => handleStatusChange(load, e.target.value)}
                    disabled={busyLoadId === load.id}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-xs text-text disabled:opacity-60"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5">
                  {confirmingDeleteId === load.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-error">Delete?</span>
                      <button
                        onClick={() => handleDelete(load)}
                        disabled={busyLoadId === load.id}
                        className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {busyLoadId === load.id ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={busyLoadId === load.id}
                        className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-alt disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleCopy(load)}
                        className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface-alt"
                      >
                        {copiedId === load.id ? 'Copied!' : 'Copy'}
                      </button>
                      {onOpenBlast && (
                        <button
                          onClick={() => onOpenBlast(load)}
                          className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface-alt"
                        >
                          Blast
                        </button>
                      )}
                      <button
                        onClick={() => onSelectLoad(load)}
                        className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface-alt"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(load.id)}
                        className="rounded-lg border border-error/40 px-3 py-1 text-xs text-error hover:bg-error-bg"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <AnimatePresence>
        {bookingModalLoad && (
          <BookingCarrierModal load={bookingModalLoad} onClose={() => setBookingModalLoad(null)} />
        )}
      </AnimatePresence>
    </Card>
  );
}

export default LoadsTable;
