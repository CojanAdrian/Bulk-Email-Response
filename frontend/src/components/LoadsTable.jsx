import { useEffect, useMemo, useState } from 'react';
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import { multiStopTagVariant } from '../lib/lookupMessage';
import Badge from './Badge';
import Card from './Card';
import Skeleton from './Skeleton';

const STATUS_OPTIONS = ['active', 'booked', 'covered'];
const STATUS_LABELS = { active: 'Active', booked: 'Booked', covered: 'Covered' };

const SORT_COLUMNS = [
  { key: 'load_number', label: 'Load #' },
  { key: 'origin', label: 'Origin' },
  { key: 'destination', label: 'Destination' },
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
    case 'equipment':
      return String(load.equipment ?? '');
    case 'target_pay':
      return Number(load.target_pay ?? 0);
    default:
      return '';
  }
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

function LoadsTable({ refreshKey, onSelectLoad }) {
  const [loads, setLoads] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [statusFilter, setStatusFilter] = useState('active');
  const [error, setError] = useState(null);
  const [liveTick, setLiveTick] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [busyLoadId, setBusyLoadId] = useState(null);
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    setStatus('loading');
    setError(null);
    listLoads(statusFilter)
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setStatus('ready');
          setSelectedIds(new Set());
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

  const sortedLoads = useMemo(() => sortLoads(loads, sort), [loads, sort]);

  function handleSortClick(key) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  }

  function handleStatusChange(load, newStatus) {
    setActionError(null);
    setBusyLoadId(load.id);
    updateLoad(load.id, { status: newStatus })
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

  function toggleSelectOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === sortedLoads.length ? new Set() : new Set(sortedLoads.map((l) => l.id))));
  }

  function handleBulkStatusChange(e) {
    const newStatus = e.target.value;
    if (!newStatus) return;
    setActionError(null);
    setBulkBusy(true);
    bulkUpdateLoadStatus(Array.from(selectedIds), newStatus)
      .then(() => {
        setSelectedIds(new Set());
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
    bulkSetIncludeRate(Array.from(selectedIds), value === 'include')
      .then(() => {
        setSelectedIds(new Set());
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
    bulkDeleteLoads(Array.from(selectedIds))
      .then(() => {
        setSelectedIds(new Set());
        setConfirmingBulkDelete(false);
      })
      .catch((err) => setActionError(err.message || 'Failed to delete selected loads.'))
      .finally(() => setBulkBusy(false));
  }

  const allSelected = sortedLoads.length > 0 && selectedIds.size === sortedLoads.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Loads</h2>
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
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
          <span className="font-medium text-text">{selectedIds.size} selected</span>
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
              <span className="text-xs text-error">Delete {selectedIds.size}?</span>
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
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
            className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
          >
            Clear selection
          </button>
        </div>
      )}
      {status === 'ready' && loads.length === 0 && <p className="text-sm text-text-muted">No loads found.</p>}
      {status === 'ready' && loads.length > 0 && (
        <table className="w-full text-left text-sm text-text">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="w-8 py-2 pr-2">
                <input
                  type="checkbox"
                  aria-label="Select all loads"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              {SORT_COLUMNS.map((col) => (
                <th key={col.key} className="py-2 pr-4">
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
              <th className="py-2 pr-4">Rate</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedLoads.map((load) => (
              <tr key={load.id} className="border-b border-border/60">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${load.load_number}`}
                    checked={selectedIds.has(load.id)}
                    onChange={() => toggleSelectOne(load.id)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span>{load.load_number}</span>
                    {Boolean(load.custom_reply_body) && <Badge variant="warning">Modified</Badge>}
                    {multiStopTagVariant(load) === 'error' && <Badge variant="error">Needs stops added</Badge>}
                    {multiStopTagVariant(load) === 'info' && <Badge variant="info">Stops added</Badge>}
                  </div>
                </td>
                <td className="py-2 pr-4">
                  {load.origin_city}, {load.origin_state}
                </td>
                <td className="py-2 pr-4">
                  {load.dest_city}, {load.dest_state}
                </td>
                <td className="py-2 pr-4">{load.equipment}</td>
                <td className="py-2 pr-4">{load.target_pay}</td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    aria-label={`Include rate for ${load.load_number}`}
                    checked={Boolean(load.include_rate)}
                    onChange={(e) => handleIncludeRateChange(load, e.target.checked)}
                    disabled={busyLoadId === load.id}
                  />
                </td>
                <td className="py-2 pr-4">
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
                <td className="py-2">
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
      )}
    </Card>
  );
}

export default LoadsTable;
