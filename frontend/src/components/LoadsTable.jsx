import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { bulkCarrierMatches, getProvenCarriers } from '../api/carrierMatches';
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
import LoadRow from './LoadRow';
import SegmentedControl from './SegmentedControl';
import Select from './Select';
import { SearchIcon, CopyIcon, SendIcon, PencilIcon, TrashIcon, CheckIcon } from './icons';
import { formatMoney } from '../lib/formatMoney';
import { usePersistentState } from '../lib/usePersistentState';

const STATUS_OPTIONS = ['active', 'booked', 'covered'];
const STATUS_LABELS = { active: 'Active', booked: 'Booked', covered: 'Covered' };
const STATUS_TONE = { active: 'success', booked: 'tag', covered: 'info' };
const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map((value) => ({ value, label: STATUS_LABELS[value] }));
const BULK_RATE_OPTIONS = [
  { value: 'include', label: 'Include rate' },
  { value: 'exclude', label: 'Exclude rate' },
];
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

function hasNoRate(load) {
  return load.target_pay === null || load.target_pay === undefined || load.target_pay === '';
}

function matchesSearch(load, query) {
  if (!query) return true;
  const haystack = `${load.load_number ?? ''} ${load.origin_city ?? ''} ${load.origin_state ?? ''} ${load.dest_city ?? ''} ${load.dest_state ?? ''} ${load.customer ?? ''}`.toLowerCase();
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
  const [provenInfo, setProvenInfo] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [quickFilter, setQuickFilter] = usePersistentState('loadsTable.quickFilter', 'all');
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

  // Gold "proven lane" lookup -- carriers who already ran each load's exact
  // lane. Best-effort like the match badge: a failure just means no gold.
  useEffect(() => {
    if (loads.length === 0) {
      setProvenInfo({});
      return undefined;
    }
    let ignore = false;
    Promise.resolve(getProvenCarriers(loads.map((load) => load.id)))
      .then((data) => {
        if (!ignore) setProvenInfo(data || {});
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [loads]);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {
      // Not persisted; the sort still applies for this visit.
    }
  }, [sort]);

  const provenLoadCount = useMemo(() => loads.filter((load) => provenInfo[load.id]?.length).length, [loads, provenInfo]);
  const needsRateCount = useMemo(() => loads.filter(hasNoRate).length, [loads]);

  const filteredLoads = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    let result = q ? loads.filter((load) => matchesSearch(load, q)) : loads;
    if (quickFilter === 'proven') result = result.filter((load) => provenInfo[load.id]?.length);
    if (quickFilter === 'needs_rate') result = result.filter(hasNoRate);
    return result;
  }, [loads, searchText, quickFilter, provenInfo]);

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

  function handleBulkStatusChange(newStatus) {
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

  function handleBulkIncludeRate(value) {
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

  const smallButton =
    'inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-control-border bg-control px-3 py-1 text-xs font-semibold text-text shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition hover:bg-control-hover active:scale-[0.97] disabled:opacity-60 sm:min-h-[30px]';

  return (
    <Card className="p-3 sm:p-5">
      <div className="mb-3 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="mr-1 text-base font-semibold text-text">Board</h2>
          <SegmentedControl
            ariaLabel="Quick filter"
            size="sm"
            value={quickFilter}
            onChange={setQuickFilter}
            options={[
              { value: 'all', label: 'All', count: loads.length },
              { value: 'proven', label: '★ Proven', count: provenLoadCount },
              { value: 'needs_rate', label: 'Needs rate', count: needsRateCount },
            ]}
          />
          {sortedLoads.length > 0 &&
            (selection.active ? (
              <div className="flex items-center gap-2 text-xs font-semibold">
                <button type="button" onClick={() => selection.selectAll(sortedLoads.map((l) => l.id))} className={smallButton}>
                  Select All
                </button>
                <button type="button" onClick={selection.exit} className={smallButton}>
                  Done
                </button>
              </div>
            ) : (
              <button type="button" onClick={selection.enter} className={smallButton}>
                Select
              </button>
            ))}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
            <span className="sr-only">Search loads</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              aria-label="Search loads"
              data-hotkey-search
              placeholder="Search load #, city, state, customer"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-full border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-focus focus:outline-none"
            />
          </label>
          <Select ariaLabel="Filter by status" value={statusFilter} onChange={setStatusFilter} options={STATUS_SELECT_OPTIONS} className="shrink-0" />
        </div>
      </div>

      {status === 'ready' && loads.length > 1 && (
        <div role="group" aria-label="Sort loads" className="mb-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
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
      )}

      {status === 'loading' && <Skeleton count={4} height="6.5rem" className="rounded-2xl" />}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-3 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
          {actionError}
        </p>
      )}
      <BottomActionBar count={selection.selectedIds.size}>
        <Select ariaLabel="Mark selected as" value="" placeholder="Mark as…" onChange={handleBulkStatusChange} options={STATUS_SELECT_OPTIONS} disabled={bulkBusy} size="sm" />
        <Select ariaLabel="Rate for selected" value="" placeholder="Rate…" onChange={handleBulkIncludeRate} options={BULK_RATE_OPTIONS} disabled={bulkBusy} size="sm" />
        {confirmingBulkDelete ? (
          <>
            <span className="text-xs text-error">Delete {selection.selectedIds.size}?</span>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="rounded-full bg-error px-3 py-1.5 text-xs font-semibold text-surface hover:opacity-90 disabled:opacity-60"
            >
              {bulkBusy ? 'Deleting...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmingBulkDelete(false)}
              disabled={bulkBusy}
              className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingBulkDelete(true)}
            disabled={bulkBusy}
            className="rounded-full border border-error/40 px-3 py-1.5 text-xs text-error hover:bg-error-bg disabled:opacity-60"
          >
            Delete selected
          </button>
        )}
        <button
          onClick={selection.clear}
          disabled={bulkBusy}
          className="ml-auto rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-60"
        >
          Clear selection
        </button>
      </BottomActionBar>

      {status === 'ready' && loads.length === 0 && (
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
          <p className="text-base font-semibold text-text">No loads found.</p>
          <p className="max-w-sm text-sm text-text-muted">
            {statusFilter === 'active'
              ? 'Upload a McLeod CSV above, or add a load by hand. Press N to add one.'
              : `Nothing is marked ${STATUS_LABELS[statusFilter].toLowerCase()} yet.`}
          </p>
        </div>
      )}
      {status === 'ready' && loads.length > 0 && sortedLoads.length === 0 && (
        <p className="px-1 py-6 text-center text-sm text-text-muted">
          {searchText.trim() ? `No loads match "${searchText}".` : quickFilter === 'proven' ? 'No proven lanes in this view yet.' : 'Every load here has a rate.'}
        </p>
      )}
      {status === 'ready' && sortedLoads.length > 0 && (
        <ul aria-label="Loads" className="space-y-2.5">
          {sortedLoads.map((load) => {
            const match = matchInfo[load.id];
            const busy = busyLoadId === load.id;
            const stopTag = multiStopTagVariant(load);
            return (
              <LoadRow
                key={load.id}
                load={load}
                proven={provenInfo[load.id]}
                expanded={expandedId === load.id}
                onToggleExpand={() => setExpandedId((prev) => (prev === load.id ? null : load.id))}
                leadingSlot={
                  selection.active ? (
                    <SelectionCircle
                      selected={selection.isSelected(load.id)}
                      onToggle={() => selection.toggle(load.id)}
                      ariaLabel={`Select ${load.load_number}`}
                    />
                  ) : null
                }
                badges={
                  <>
                    {match && (
                      <button
                        type="button"
                        onClick={() => onViewMatches && onViewMatches(load)}
                        className="cursor-pointer rounded-full border-0 bg-transparent p-0"
                        title="See matching carriers on the map"
                      >
                        <Badge variant={MATCH_BADGE_VARIANT[match.tier] || 'default'}>
                          {match.count} match{match.count === 1 ? '' : 'es'}
                        </Badge>
                      </button>
                    )}
                    {Boolean(load.custom_reply_body) && <Badge variant="warning">Modified</Badge>}
                    {stopTag === 'error' && <Badge variant="error">Needs stops added</Badge>}
                    {stopTag === 'info' && <Badge variant="info">Stops added</Badge>}
                  </>
                }
                puField={
                  <DateRangeField
                    legend="Pickup"
                    variant="chip"
                    showLegend={false}
                    earlyId={`pu-early-${load.id}`}
                    lateId={`pu-late-${load.id}`}
                    earlyValue={puValuesFor(load).early_pu}
                    lateValue={puValuesFor(load).late_pu}
                    onEarlyChange={(value) => handlePuChange(load, 'early_pu', value)}
                    onLateChange={(value) => handlePuChange(load, 'late_pu', value)}
                    formatRange={buildPUSched}
                  />
                }
                rateField={
                  editingTargetPayId === load.id ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      autoFocus
                      aria-label={`Target pay for ${load.load_number}`}
                      value={targetPayDraft}
                      onChange={(e) => setTargetPayDraft(e.target.value)}
                      onBlur={() => saveTargetPay(load)}
                      onKeyDown={(e) => handleTargetPayKeyDown(e, load)}
                      className="w-28 rounded-xl border border-focus bg-surface-alt px-2 py-1 text-right text-sm font-semibold tabular-nums text-text focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditTargetPay(load)}
                      aria-label={`Edit rate for ${load.load_number}, currently ${formatMoney(load.target_pay)}`}
                      title="Click to edit the rate"
                      className={`rounded-lg px-1.5 py-0.5 text-[15px] font-semibold tabular-nums transition hover:bg-surface-alt sm:text-base ${
                        load.target_pay === null || load.target_pay === undefined || load.target_pay === '' ? 'text-warning' : 'text-text'
                      }`}
                    >
                      {load.target_pay === null || load.target_pay === undefined || load.target_pay === '' ? 'Add rate' : formatMoney(load.target_pay)}
                    </button>
                  )
                }
                controls={
                  <>
                    <Select
                      ariaLabel={`Status for ${load.load_number}`}
                      value={load.status}
                      onChange={(value) => handleStatusChange(load, value)}
                      options={STATUS_SELECT_OPTIONS}
                      disabled={busy}
                      size="sm"
                      tone={STATUS_TONE[load.status]}
                    />
                    <label className="inline-flex min-h-[36px] cursor-pointer select-none items-center gap-2 rounded-full px-1.5 py-1 text-xs font-semibold text-text sm:min-h-[30px]">
                      <input
                        type="checkbox"
                        aria-label={`Include rate for ${load.load_number}`}
                        checked={Boolean(load.include_rate)}
                        onChange={(e) => handleIncludeRateChange(load, e.target.checked)}
                        disabled={busy}
                        className="peer sr-only"
                      />
                      {/* A real switch: track + knob, lime when on. */}
                      <span
                        aria-hidden="true"
                        className="relative h-5 w-9 shrink-0 rounded-full border border-control-border bg-field transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-text-muted after:transition-transform after:duration-200 peer-checked:border-accent-strong peer-checked:bg-accent peer-checked:after:translate-x-4 peer-checked:after:bg-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus peer-disabled:opacity-50"
                      />
                      <span aria-hidden="true">Rate in reply</span>
                    </label>
                  </>
                }
                actions={
                  confirmingDeleteId === load.id ? (
                    <>
                      <span className="text-xs text-error">Delete?</span>
                      <button
                        onClick={() => handleDelete(load)}
                        disabled={busy}
                        className="rounded-full bg-error px-3 py-1 text-xs font-semibold text-surface hover:opacity-90 disabled:opacity-60"
                      >
                        {busy ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmingDeleteId(null)} disabled={busy} className={smallButton}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleCopy(load)} className={smallButton} title="Copy the load details for a carrier">
                        {copiedId === load.id ? <CheckIcon aria-hidden="true" className="h-3.5 w-3.5 text-success" /> : <CopyIcon aria-hidden="true" className="h-3.5 w-3.5" />}
                        {copiedId === load.id ? 'Copied!' : 'Copy'}
                      </button>
                      {onOpenBlast && (
                        <button
                          onClick={() => onOpenBlast(load)}
                          title="Email this load to carriers"
                          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-ink shadow-[0_2px_10px_rgba(215,255,61,0.25)] transition hover:bg-accent-strong active:scale-[0.97] sm:min-h-[30px]"
                        >
                          <SendIcon aria-hidden="true" className="h-3.5 w-3.5" />
                          Blast
                        </button>
                      )}
                      <button onClick={() => onSelectLoad(load)} className={smallButton}>
                        <PencilIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(load.id)}
                        aria-label="Delete"
                        title={`Delete load ${load.load_number}`}
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-error/40 px-2 py-1 text-xs font-semibold text-error transition hover:bg-error-bg sm:min-h-[30px] sm:min-w-[30px]"
                      >
                        <TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )
                }
              />
            );
          })}
        </ul>
      )}
      <AnimatePresence>
        {bookingModalLoad && <BookingCarrierModal load={bookingModalLoad} onClose={() => setBookingModalLoad(null)} />}
      </AnimatePresence>
    </Card>
  );
}

export default LoadsTable;
