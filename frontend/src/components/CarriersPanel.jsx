import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listCarriers, deleteCarrier } from '../api/carriers';
import Card from './Card';
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Carriers</h2>
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search carriers"
            placeholder="Search company, MC, dispatcher..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-48 rounded-lg border border-border bg-surface-alt px-2 py-1 text-sm text-text sm:w-64"
          />
          <PrimaryButton onClick={() => setSheetTarget('new')} className="px-3 py-1.5 text-xs">
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
      {status === 'ready' && carriers.length === 0 && <p className="text-sm text-text-muted">No carriers yet.</p>}
      {status === 'ready' && carriers.length > 0 && (
        <ul className="divide-y divide-border">
          {carriers.map((carrier) => (
            <li key={carrier.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <button type="button" onClick={() => setDetailCarrierId(carrier.id)} className="min-w-0 flex-1 truncate text-left text-text hover:underline">
                <span className="font-medium">{carrier.company_name}</span>
                {carrier.mc_number && <span className="ml-2 text-text-muted">MC {carrier.mc_number}</span>}
              </button>
              {confirmingDeleteId === carrier.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button onClick={() => handleDelete(carrier.id)} className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmingDeleteId(null)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(carrier.id)}
                  aria-label={`Delete ${carrier.company_name}`}
                  className="shrink-0 rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg"
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
