import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { listCustomers, getCustomerCarriers, getCustomerLoads, deleteCustomer } from '../../api/customers';
import { usePersistentState } from '../../lib/usePersistentState';
import { formatDayAgo } from '../../lib/formatDay';
import { useScreenMap, laneFromRow } from '../../map/useScreenMap';
import Skeleton from '../../components/Skeleton';
import ScreenPanel, { Chips, PanelSearch, EmptyNote } from '../../ui/ScreenPanel';
import { SheetBackdrop, SHEET_SPRING } from '../../ui/Sheet';
import CustomerSheet from './CustomerSheet';

const TYPE_TAG = { contract: 'Contract', spot: 'Spot', mixed: 'Both' };

function countForType(customer, type) {
  if (type === 'contract') return customer.contractLoads || 0;
  if (type === 'spot') return customer.spotLoads || 0;
  return customer.loadCount || 0;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function nameFrom(pathname) {
  const match = pathname.match(/^\/customers\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function lanesForLoads(loads) {
  const rows = [...(loads?.available || []), ...(loads?.done || [])];
  return rows.map((load) => laneFromRow(load.id, load, { gold: false })).filter(Boolean);
}

// Every customer, busiest first. Hovering one draws their lanes; opening one
// shows who hauls for them and their loads.
function CustomersScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const openName = nameFrom(location.pathname);

  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = usePersistentState('customers.loadType', 'all');
  const [filters, setFilters] = usePersistentState('customers.filters', { range: 'all', equipment: '', loadType: 'all' });
  const [hoverName, setHoverName] = useState(null);
  const [hoverLoad, setHoverLoad] = useState(null);
  const [detail, setDetail] = useState({ status: 'idle', carriers: null, loads: null });
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const previews = useRef(new Map());
  const [, setPreviewVersion] = useState(0);

  useEffect(() => {
    let ignore = false;
    Promise.resolve(listCustomers())
      .then((list) => {
        if (ignore) return;
        setCustomers(Array.isArray(list) ? list : []);
        setStatus('ready');
      })
      .catch(() => {
        if (!ignore) setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
    if (typeFilter !== 'all') list = list.filter((c) => countForType(c, typeFilter) > 0).sort((a, b) => countForType(b, typeFilter) - countForType(a, typeFilter));
    return list;
  }, [customers, query, typeFilter]);

  const openCustomer = openName ? customers.find((c) => c.name.toLowerCase() === openName.toLowerCase()) || null : null;

  // The open customer's carriers and loads, with the sheet's filters.
  useEffect(() => {
    if (!openCustomer) return undefined;
    let ignore = false;
    setDetail((prev) => ({ ...prev, status: 'loading' }));
    const params = { name: openCustomer.name, ...filters };
    Promise.all([getCustomerCarriers(params), getCustomerLoads(params)])
      .then(([carriers, loads]) => {
        if (ignore) return;
        setDetail({ status: 'ready', carriers: carriers || [], loads: { available: loads?.available || [], done: loads?.done || [] } });
      })
      .catch(() => {
        if (!ignore) setDetail({ status: 'error', carriers: null, loads: null });
      });
    return () => {
      ignore = true;
    };
  }, [openCustomer?.name, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hovering a customer fetches their loads once, to preview their lanes.
  const preview = useCallback((name) => {
    setHoverName(name);
    if (!name || previews.current.has(name)) return;
    previews.current.set(name, null);
    Promise.resolve(getCustomerLoads({ name }))
      .then((loads) => {
        previews.current.set(name, loads);
        setPreviewVersion((v) => v + 1);
      })
      .catch(() => previews.current.delete(name));
  }, []);

  const shownLoads = openCustomer ? detail.loads : hoverName ? previews.current.get(hoverName) : null;
  const lanes = useMemo(() => lanesForLoads(shownLoads), [shownLoads]);
  useScreenMap({ lanes, focusId: openCustomer ? hoverLoad : null, sheetOpen: Boolean(openCustomer) });

  function close() {
    navigate('/customers');
  }

  function remove() {
    if (!openCustomer) return;
    setRemoving(true);
    setRemoveError(null);
    deleteCustomer(openCustomer.name)
      .then(() => {
        setCustomers((prev) => prev.filter((c) => c.name !== openCustomer.name));
        close();
      })
      .catch((err) => setRemoveError(err.message || "Couldn't remove this customer."))
      .finally(() => setRemoving(false));
  }

  const typeOptions = [
    { value: 'all', label: 'All', count: customers.length },
    { value: 'contract', label: 'Contract', count: customers.filter((c) => countForType(c, 'contract') > 0).length },
    { value: 'spot', label: 'Spot', count: customers.filter((c) => countForType(c, 'spot') > 0).length },
  ];

  return (
    <>
      <ScreenPanel
        label="Customers"
        count={customers.length}
        caption="Shippers"
        title={customers.length === 1 ? 'customer' : 'customers'}
        pushedBack={Boolean(openCustomer)}
        onPointerLeave={() => setHoverName(null)}
        toolbar={
          <>
            <PanelSearch label="Search customers" placeholder="Search customers" value={query} onChange={setQuery} />
            <Chips label="Customer load type" value={typeFilter} onChange={setTypeFilter} options={typeOptions} className="w-full" />
          </>
        }
      >
        {status === 'loading' && (
          <div className="px-2 pt-2">
            <Skeleton count={6} height="3.6rem" className="rounded-[18px]" />
          </div>
        )}
        {status === 'error' && (
          <p role="alert" className="px-4 py-6 text-sm text-error">
            Couldn't load customers. Check your connection and try again.
          </p>
        )}
        {status === 'ready' && customers.length === 0 && (
          <EmptyNote title="No customers yet.">Customers come from the Customer column of a McLeod CSV, or the Customer field on a load.</EmptyNote>
        )}
        {status === 'ready' && customers.length > 0 && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-text-muted">No customer matches "{query}".</p>}
        {rows.length > 0 && (
          <ul aria-label="Customers">
            {rows.map((customer) => (
              <li key={customer.name} onPointerEnter={() => preview(customer.name)}>
                <motion.button
                  type="button"
                  layoutId={`customer-${customer.name}`}
                  transition={SHEET_SPRING}
                  onClick={() => navigate(`/customers/${encodeURIComponent(customer.name)}`)}
                  aria-label={`Open ${customer.name}`}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-[18px] px-[18px] py-[12px] text-left transition-colors hover:bg-white/[0.065] ${hoverName === customer.name ? 'bg-white/[0.065]' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">{customer.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-text-muted">
                      {plural(typeFilter === 'all' ? customer.loadCount : countForType(customer, typeFilter), 'load')} · {plural(customer.carrierCount, 'carrier')}
                      {customer.lastActivity ? ` · ${formatDayAgo(customer.lastActivity)}` : ''}
                    </span>
                  </span>
                  {TYPE_TAG[customer.loadType] && <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold text-text-muted">{TYPE_TAG[customer.loadType]}</span>}
                </motion.button>
              </li>
            ))}
          </ul>
        )}
      </ScreenPanel>

      {openCustomer && <SheetBackdrop onClose={close} />}
      <AnimatePresence>
        {openCustomer && (
          <CustomerSheet
            key={openCustomer.name}
            customer={openCustomer}
            filters={filters}
            onFiltersChange={(change) => setFilters((prev) => ({ ...prev, ...change }))}
            carriers={detail.carriers}
            loads={detail.loads}
            status={detail.status}
            onClose={close}
            onRemove={remove}
            removing={removing}
            removeError={removeError}
            onOpenCarrier={(id) => id && navigate(`/carriers/${id}`)}
            onOpenLoad={(id) => navigate(`/loads/${id}`)}
            onHoverLoad={setHoverLoad}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default CustomersScreen;
