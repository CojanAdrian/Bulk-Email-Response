import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listCustomers, getCustomerCarriers, deleteCustomer } from '../api/customers';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import { formatMoney } from '../lib/formatMoney';
import { formatDayAgo, formatDayFull } from '../lib/formatDay';
import { usePersistentState } from '../lib/usePersistentState';
import { useMotionPreset } from '../lib/motionConfig';
import Card from '../components/Card';
import SegmentedControl from '../components/SegmentedControl';
import Skeleton from '../components/Skeleton';
import CarrierDetailSheet from '../components/CarrierDetailSheet';
import CarrierSheet from '../components/CarrierSheet';
import { SearchIcon, UsersIcon, TruckIcon, TrashIcon } from '../components/icons';
import Select from '../components/Select';

const RANGE_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'contract', label: 'Contract' },
  { value: 'spot', label: 'Spot' },
];

const TYPE_TAG = {
  contract: { label: 'Contract', className: 'bg-info-bg text-info' },
  spot: { label: 'Spot', className: 'bg-warning-bg text-warning' },
  mixed: { label: 'Contract + spot', className: 'bg-tag-bg text-tag' },
};

function TypeTag({ type, active }) {
  const tag = TYPE_TAG[type];
  if (!tag) return null;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active ? 'bg-accent-ink/15 text-accent-ink' : tag.className}`}>
      {tag.label}
    </span>
  );
}

function countForType(customer, type) {
  if (type === 'contract') return customer.contractLoads || 0;
  if (type === 'spot') return customer.spotLoads || 0;
  return customer.loadCount || 0;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function EmptyState({ icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-alt text-text-muted">{icon}</span>
      <p className="text-base font-semibold text-text">{title}</p>
      <p className="max-w-sm text-sm text-text-muted">{children}</p>
    </div>
  );
}

function CustomerList({ customers, status, query, onQueryChange, selected, onSelect, typeFilter, onTypeFilterChange }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
    // Contract / Spot: only customers who ship that way with us, busiest first.
    if (typeFilter !== 'all') {
      list = list.filter((c) => countForType(c, typeFilter) > 0).sort((a, b) => countForType(b, typeFilter) - countForType(a, typeFilter));
    }
    return list;
  }, [customers, query, typeFilter]);

  const typeOptions = TYPE_OPTIONS.map((o) => ({
    ...o,
    count: o.value === 'all' ? customers.length : customers.filter((c) => countForType(c, o.value) > 0).length,
  }));

  return (
    <Card className="flex max-h-[45vh] min-h-0 flex-col p-3 sm:p-4 md:sticky md:top-20 md:max-h-[calc(100vh-7rem)]">
      <label className="relative mb-3 block">
        <span className="sr-only">Search customers</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          data-hotkey-search
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search customers"
          className="w-full rounded-xl border border-border bg-surface-alt py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-focus focus:outline-none"
        />
      </label>

      <SegmentedControl ariaLabel="Customer load type" size="sm" options={typeOptions} value={typeFilter} onChange={onTypeFilterChange} className="mb-3" />

      {status === 'loading' && <Skeleton count={6} height="3.25rem" />}
      {status === 'error' && (
        <p role="alert" className="px-2 py-4 text-sm text-error">
          Couldn&apos;t load customers. Check your connection and try again.
        </p>
      )}
      {status === 'ready' && customers.length === 0 && (
        <EmptyState icon={<UsersIcon className="h-6 w-6" />} title="No customers yet">
          Customers come from the <strong>Customer</strong> column of an uploaded McLeod CSV, or the Customer field when you add or edit a load.
        </EmptyState>
      )}
      {status === 'ready' && customers.length > 0 && filtered.length === 0 && (
        <p className="px-2 py-4 text-sm text-text-muted">No customer matches &ldquo;{query}&rdquo;.</p>
      )}
      {status === 'ready' && filtered.length > 0 && (
        <ul aria-label="Customers" className="-mx-1 min-h-0 space-y-1 overflow-y-auto px-1">
          {filtered.map((customer) => {
            const active = selected && customer.name.toLowerCase() === selected.toLowerCase();
            return (
              <li key={customer.name}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(customer.name)}
                  className={`w-full min-w-0 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 ${
                    active ? 'bg-accent text-accent-ink' : 'text-text hover:bg-surface-alt'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={customer.name}>
                      {customer.name}
                    </span>
                    <TypeTag type={customer.loadType} active={active} />
                  </span>
                  <span className={`block truncate text-xs ${active ? 'text-accent-ink/80' : 'text-text-muted'}`}>
                    {typeFilter === 'all' ? plural(customer.loadCount, 'load') : plural(countForType(customer, typeFilter), typeFilter + ' load')} ·{' '}
                    {plural(customer.carrierCount, 'carrier')}
                    {customer.lastActivity ? ` · ${formatDayAgo(customer.lastActivity)}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums text-text">{value}</dd>
    </div>
  );
}

function CarrierCard({ carrier, onOpen, index }) {
  const preset = useMotionPreset();
  return (
    <motion.li
      initial={preset.reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: preset.reduced ? 0 : Math.min(index, 8) * 0.03, type: 'spring', stiffness: 400, damping: 34 }}
    >
      <button
        type="button"
        onClick={() => onOpen(carrier.carrierId)}
        className="glass glass-hover block w-full min-w-0 rounded-2xl p-4 text-left text-text"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold" title={carrier.carrierName}>
              {carrier.carrierName}
            </p>
            <p className="truncate text-xs text-text-muted">{carrier.mcNumber ? `MC ${carrier.mcNumber}` : 'No MC on file'}</p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-alt px-2.5 py-1 text-xs font-bold tabular-nums text-text">
            {plural(carrier.runs, 'run')}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Last ran" value={<span title={formatDayFull(carrier.lastRanAt)}>{formatDayAgo(carrier.lastRanAt)}</span>} />
          <Stat label="Avg rate" value={formatMoney(carrier.avgRate)} />
          <Stat label="Avg GP" value={formatMoney(carrier.avgGp)} />
        </dl>
        {carrier.lanes.length > 0 && (
          <ul aria-label="Lanes run" className="mt-3 flex flex-wrap gap-1.5">
            {carrier.lanes.slice(0, 4).map((lane) => (
              <li key={lane.lane} className="max-w-full truncate rounded-full border border-border px-2.5 py-0.5 text-[11px] text-text-muted" title={lane.lane}>
                {lane.lane}
                {lane.runs > 1 ? ` ×${lane.runs}` : ''}
              </li>
            ))}
            {carrier.lanes.length > 4 && (
              <li className="rounded-full px-1.5 py-0.5 text-[11px] text-text-muted">+{carrier.lanes.length - 4} more</li>
            )}
          </ul>
        )}
      </button>
    </motion.li>
  );
}

function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [listStatus, setListStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = usePersistentState('customers.selected', null);
  const [range, setRange] = usePersistentState('customers.range', 'all');
  const [equipment, setEquipment] = usePersistentState('customers.equipment', '');
  const [typeFilter, setTypeFilter] = usePersistentState('customers.loadType', 'all');
  const [carriers, setCarriers] = useState([]);
  const [carrierStatus, setCarrierStatus] = useState('idle');
  const [detailCarrierId, setDetailCarrierId] = useState(null);
  const [editingCarrier, setEditingCarrier] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listCustomers()
      .then((list) => {
        if (cancelled) return;
        setCustomers(list);
        setListStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setListStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A remembered selection that no longer exists (renamed/removed) falls back
  // to the most recently active customer.
  const effectiveSelected = useMemo(() => {
    if (listStatus !== 'ready' || customers.length === 0) return null;
    const match = selected && customers.find((c) => c.name.toLowerCase() === String(selected).toLowerCase());
    return match ? match.name : customers[0].name;
  }, [customers, listStatus, selected]);

  useEffect(() => {
    if (!effectiveSelected) return undefined;
    let cancelled = false;
    setCarrierStatus('loading');
    getCustomerCarriers({ name: effectiveSelected, range, equipment, loadType: typeFilter })
      .then((rows) => {
        if (cancelled) return;
        setCarriers(rows);
        setCarrierStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setCarrierStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveSelected, range, equipment, typeFilter, reloadKey]);

  const selectedCustomer = customers.find((c) => c.name === effectiveSelected);

  // Switching customers cancels a half-finished "remove?" prompt.
  useEffect(() => {
    setConfirmingDelete(false);
    setDeleteError(null);
  }, [effectiveSelected]);

  function handleDelete() {
    if (!selectedCustomer) return;
    setDeleting(true);
    setDeleteError(null);
    deleteCustomer(selectedCustomer.name)
      .then(() => {
        setCustomers((prev) => prev.filter((c) => c.name !== selectedCustomer.name));
        setSelected(null);
        setConfirmingDelete(false);
      })
      .catch((err) => setDeleteError(err.message || "Couldn't remove this customer."))
      .finally(() => setDeleting(false));
  }

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <CustomerList
        customers={customers}
        status={listStatus}
        query={query}
        onQueryChange={setQuery}
        selected={effectiveSelected}
        onSelect={setSelected}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
      />

      <section aria-label="Carriers for this customer" className="min-w-0 space-y-4">
        {selectedCustomer && (
          <Card className="space-y-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words font-display text-xl font-bold tracking-tight text-text sm:text-2xl">{selectedCustomer.name}</h2>
              <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                <span>
                  {plural(selectedCustomer.loadCount, 'load')} ({selectedCustomer.contractLoads || 0} contract · {selectedCustomer.spotLoads || 0} spot) ·{' '}
                  {plural(selectedCustomer.carrierCount, 'carrier')} have hauled for them
                </span>
                <TypeTag type={selectedCustomer.loadType} />
              </p>
            </div>
              {!confirmingDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label={`Remove ${selectedCustomer.name}`}
                  title="Remove this customer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-error/40 px-3 py-1.5 text-xs font-semibold text-error transition hover:bg-error-bg"
                >
                  <TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Remove</span>
                </button>
              )}
            </div>
            {confirmingDelete && (
              <div role="alertdialog" aria-label="Remove customer" className="rounded-2xl border border-error/40 bg-error-bg p-3 text-sm text-text">
                <p>
                  Remove <strong>{selectedCustomer.name}</strong>? Its {plural(selectedCustomer.loadCount, 'load')} and carrier runs stay — only the
                  customer name is cleared from them. A future CSV that names this customer will bring it back.
                </p>
                {deleteError && <p className="mt-1 text-error">{deleteError}</p>}
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="rounded-full border border-control-border bg-control px-3 py-1.5 text-xs font-semibold text-text hover:bg-control-hover"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-full bg-error px-3 py-1.5 text-xs font-bold text-surface hover:opacity-90 disabled:opacity-60"
                  >
                    {deleting ? 'Removing…' : 'Remove customer'}
                  </button>
                </div>
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <SegmentedControl ariaLabel="Time range" options={RANGE_OPTIONS} value={range} onChange={setRange} className="sm:w-auto" />
              <div className="flex min-w-0 items-center gap-2 text-sm text-text-muted">
                <span aria-hidden="true" className="shrink-0">Equipment</span>
                <Select
                  ariaLabel="Equipment"
                  value={equipment}
                  onChange={setEquipment}
                  options={[{ value: '', label: 'Any equipment' }, ...EQUIPMENT_OPTIONS.map((o) => ({ value: o.code, label: o.label, hint: o.code }))]}
                  className="min-w-0 flex-1 sm:w-56 sm:flex-none"
                />
              </div>
            </div>
          </Card>
        )}

        {carrierStatus === 'loading' && <Skeleton count={3} height="8.5rem" className="rounded-2xl" />}
        {carrierStatus === 'error' && (
          <Card>
            <p role="alert" className="text-sm text-error">
              Couldn&apos;t load carriers for this customer.
            </p>
          </Card>
        )}
        {carrierStatus === 'ready' && carriers.length === 0 && (
          <Card>
            <EmptyState icon={<TruckIcon className="h-6 w-6" />} title="No carrier runs in this view">
              {range !== 'all' || equipment
                ? 'Try a longer time range or any equipment.'
                : "Book a load for this customer (or log a lane in a carrier's history) and the carrier shows up here."}
            </EmptyState>
          </Card>
        )}
        {carrierStatus === 'ready' && carriers.length > 0 && (
          <ul className="grid min-w-0 gap-3 xl:grid-cols-2">
            {carriers.map((carrier, index) => (
              <CarrierCard key={carrier.carrierId} carrier={carrier} index={index} onOpen={setDetailCarrierId} />
            ))}
          </ul>
        )}
      </section>

      <AnimatePresence>
        {detailCarrierId && (
          <CarrierDetailSheet
            carrierId={detailCarrierId}
            onClose={() => setDetailCarrierId(null)}
            onEdit={(carrier) => {
              setDetailCarrierId(null);
              setEditingCarrier(carrier);
            }}
          />
        )}
        {editingCarrier && (
          <CarrierSheet
            carrier={editingCarrier}
            onClose={() => setEditingCarrier(null)}
            onSaved={() => {
              setEditingCarrier(null);
              setReloadKey((k) => k + 1);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default CustomersPage;
