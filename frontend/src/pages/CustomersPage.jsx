import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listCustomers, getCustomerCarriers } from '../api/customers';
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
import { SearchIcon, UsersIcon, TruckIcon } from '../components/icons';

const RANGE_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];

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

function CustomerList({ customers, status, query, onQueryChange, selected, onSelect }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
  }, [customers, query]);

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
                  <span className="block truncate text-sm font-semibold" title={customer.name}>
                    {customer.name}
                  </span>
                  <span className={`block truncate text-xs ${active ? 'text-accent-ink/80' : 'text-text-muted'}`}>
                    {plural(customer.loadCount, 'load')} · {plural(customer.carrierCount, 'carrier')}
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
  const [carriers, setCarriers] = useState([]);
  const [carrierStatus, setCarrierStatus] = useState('idle');
  const [detailCarrierId, setDetailCarrierId] = useState(null);
  const [editingCarrier, setEditingCarrier] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

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
    getCustomerCarriers({ name: effectiveSelected, range, equipment })
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
  }, [effectiveSelected, range, equipment, reloadKey]);

  const selectedCustomer = customers.find((c) => c.name === effectiveSelected);

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <CustomerList
        customers={customers}
        status={listStatus}
        query={query}
        onQueryChange={setQuery}
        selected={effectiveSelected}
        onSelect={setSelected}
      />

      <section aria-label="Carriers for this customer" className="min-w-0 space-y-4">
        {selectedCustomer && (
          <Card className="space-y-4">
            <div className="min-w-0">
              <h2 className="break-words font-display text-xl font-bold tracking-tight text-text sm:text-2xl">{selectedCustomer.name}</h2>
              <p className="text-sm text-text-muted">
                {plural(selectedCustomer.loadCount, 'load')} · {plural(selectedCustomer.carrierCount, 'carrier')} have hauled for them
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <SegmentedControl ariaLabel="Time range" options={RANGE_OPTIONS} value={range} onChange={setRange} className="sm:w-auto" />
              <label className="flex min-w-0 items-center gap-2 text-sm text-text-muted">
                <span className="shrink-0">Equipment</span>
                <select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text focus:border-focus focus:outline-none sm:flex-none"
                >
                  <option value="">Any</option>
                  {EQUIPMENT_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
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
