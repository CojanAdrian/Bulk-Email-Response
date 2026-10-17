import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listCarriers, deleteCarrier } from '../api/carriers';
import Card from './Card';
import { SearchIcon } from './icons';
import CarrierDetailSheet from './CarrierDetailSheet';
import CarrierSheet from './CarrierSheet';
import PrimaryButton from './PrimaryButton';
import Skeleton from './Skeleton';

function CarriersPanel() {
  const [carriers, setCarriers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [sheetTarget, setSheetTarget] = useState(null); // null = closed, 'new' = add, carrier object = edit
  const [detailCarrierId, setDetailCarrierId] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function fetchCarriers(query) {
    setStatus('loading');
    setError(null);
    listCarriers(query || undefined)
      .then((data) => {
        if (isMountedRef.current) {
          setCarriers(data);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load carriers.');
          setStatus('error');
        }
      });
  }

  useEffect(() => {
    const timeout = setTimeout(() => fetchCarriers(searchText.trim()), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function handleSaved(carrier) {
    setCarriers((prev) => {
      const exists = prev.some((c) => c.id === carrier.id);
      return exists ? prev.map((c) => (c.id === carrier.id ? carrier : c)) : [carrier, ...prev];
    });
  }

  function handleDelete(id) {
    deleteCarrier(id).then(() => {
      if (isMountedRef.current) {
        setCarriers((prev) => prev.filter((c) => c.id !== id));
        setConfirmingDeleteId(null);
      }
    });
  }

  return (
    <Card>
      <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-text">
          Carriers {status === 'ready' && <span className="ml-1 text-sm font-medium tabular-nums text-text-muted">{carriers.length}</span>}
        </h2>
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <span className="sr-only">Search carriers</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              aria-label="Search carriers"
              data-hotkey-search
              placeholder="Search company, MC, dispatcher"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-full border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-focus focus:outline-none"
            />
          </label>
          <PrimaryButton onClick={() => setSheetTarget('new')} className="shrink-0 px-4 py-2 text-xs">
            + Add carrier
          </PrimaryButton>
        </div>
      </div>

      {status === 'loading' && <Skeleton count={4} height="2.5rem" />}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && carriers.length === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">No carriers yet. Add your first one, or book a load and save the carrier from there.</p>
      )}
      {status === 'ready' && carriers.length > 0 && (
        <ul className="-mx-2 space-y-0.5">
          {carriers.map((carrier) => (
            <li key={carrier.id} className="group flex min-w-0 items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-surface-alt">
              <button type="button" onClick={() => setDetailCarrierId(carrier.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left text-text">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-alt text-xs font-bold text-text-muted group-hover:bg-surface">
                  {String(carrier.company_name || '?').trim().slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold" title={carrier.company_name}>{carrier.company_name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {[carrier.mc_number && `MC ${carrier.mc_number}`, carrier.dispatcher_name, Array.isArray(carrier.equipment_types) && carrier.equipment_types.length ? carrier.equipment_types.join(' · ') : null]
                      .filter(Boolean)
                      .join(' · ') || 'No details yet'}
                  </span>
                </span>
              </button>
              {confirmingDeleteId === carrier.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button onClick={() => handleDelete(carrier.id)} className="rounded-full bg-error px-3 py-1 text-xs font-semibold text-surface hover:opacity-90">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmingDeleteId(null)} className="rounded-full border border-border px-3 py-1 text-xs text-text hover:bg-surface">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(carrier.id)}
                  aria-label={`Delete ${carrier.company_name}`}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-text-muted transition hover:bg-error-bg hover:text-error focus-visible:text-error"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {detailCarrierId && (
          <CarrierDetailSheet
            carrierId={detailCarrierId}
            onClose={() => setDetailCarrierId(null)}
            onEdit={(carrier) => {
              setDetailCarrierId(null);
              setSheetTarget(carrier);
            }}
          />
        )}
        {sheetTarget && (
          <CarrierSheet
            carrier={sheetTarget === 'new' ? null : sheetTarget}
            onClose={() => setSheetTarget(null)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </Card>
  );
}

export default CarriersPanel;
