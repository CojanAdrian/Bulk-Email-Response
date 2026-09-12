import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getCarrier, listCarrierHistory } from '../api/carriers';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import BottomSheet from './BottomSheet';
import Badge from './Badge';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';
import { PhoneIcon, MailIcon } from './icons';

const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT_OPTIONS.map((o) => [o.code, o.label]));

// Read-only carrier profile -- what you open to actually call/email someone,
// as opposed to CarrierSheet which is the edit form. Fetches its own full
// record + lane history by id so it can be opened from anywhere (a match
// card, the plain carrier list) with only an id in hand.
function CarrierDetailSheet({ carrierId, onClose, onEdit }) {
  const [carrier, setCarrier] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setStatus('loading');
    Promise.all([getCarrier(carrierId), listCarrierHistory(carrierId)])
      .then(([carrierData, historyData]) => {
        if (isMountedRef.current) {
          setCarrier(carrierData);
          setHistory(historyData);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (isMountedRef.current) setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId]);

  return (
    <AnimatePresence>
      <BottomSheet onClose={onClose} className="max-w-2xl">
        {status === 'loading' && <Skeleton count={4} height="2.5rem" />}
        {status === 'error' && (
          <p role="alert" className="text-sm text-error">
            Failed to load this carrier.
          </p>
        )}
        {status === 'ready' && carrier && (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">{carrier.company_name}</h2>
                {carrier.mc_number && <p className="text-sm text-text-muted">MC {carrier.mc_number}</p>}
              </div>
              <SecondaryButton onClick={() => onEdit(carrier)} className="shrink-0 px-3 py-1.5 text-xs">
                Edit
              </SecondaryButton>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {carrier.dispatcher_name && (
                <div className="rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-text-muted">Dispatcher</span>
                  {carrier.dispatcher_name}
                </div>
              )}
              {carrier.dispatcher_phone && (
                <a
                  href={`tel:${carrier.dispatcher_phone.replace(/[^\d+]/g, '')}`}
                  className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-text hover:bg-accent/20"
                >
                  <PhoneIcon className="h-4 w-4 shrink-0 text-accent-strong" />
                  {carrier.dispatcher_phone}
                </a>
              )}
              {carrier.dispatcher_email && (
                <a
                  href={`mailto:${carrier.dispatcher_email}`}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text hover:bg-border"
                >
                  <MailIcon className="h-4 w-4 shrink-0 text-text-muted" />
                  {carrier.dispatcher_email}
                </a>
              )}
            </div>

            {Array.isArray(carrier.equipment_types) && carrier.equipment_types.length > 0 && (
              <div className="mb-4">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Equipment</span>
                <div className="flex flex-wrap gap-1.5">
                  {carrier.equipment_types.map((code) => (
                    <Badge key={code} variant="info">
                      {EQUIPMENT_LABEL[code] || code}
                    </Badge>
                  ))}
                </div>
                {carrier.equipment_notes && <p className="mt-1 text-sm text-text-muted">{carrier.equipment_notes}</p>}
              </div>
            )}

            {(Array.isArray(carrier.operating_states) && carrier.operating_states.length > 0) || carrier.operating_notes ? (
              <div className="mb-4">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Where they operate</span>
                {Array.isArray(carrier.operating_states) && carrier.operating_states.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    {carrier.operating_states.map((state) => (
                      <Badge key={state}>{state}</Badge>
                    ))}
                  </div>
                )}
                {carrier.operating_notes && <p className="text-sm text-text-muted">{carrier.operating_notes}</p>}
              </div>
            ) : null}

            {carrier.comment && (
              <div className="mb-4">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Comment</span>
                <p className="text-sm text-text-muted">{carrier.comment}</p>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">Lane history</span>
              {history.length === 0 && <p className="text-sm text-text-muted">No lanes logged yet.</p>}
              <ul className="space-y-2">
                {history.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-text">
                        {entry.origin_city}, {entry.origin_state} → {entry.dest_city}, {entry.dest_state}
                      </span>
                      {entry.rate && <span className="text-text-muted">${Number(entry.rate).toLocaleString()}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      {entry.ran_at && new Date(entry.ran_at).toLocaleDateString()}
                      {entry.driver_name && ` — ${entry.driver_name}`}
                      {entry.driver_phone && ` (${entry.driver_phone})`}
                    </div>
                    {entry.comment && <p className="mt-1 text-xs text-text-muted">{entry.comment}</p>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex justify-end">
              <SecondaryButton onClick={onClose}>Close</SecondaryButton>
            </div>
          </>
        )}
      </BottomSheet>
    </AnimatePresence>
  );
}

export default CarrierDetailSheet;
