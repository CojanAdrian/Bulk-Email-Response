import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  createCarrier, updateCarrier,
  listCarrierHistory, createCarrierHistory, deleteCarrierHistory,
} from '../api/carriers';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import { US_STATES } from '../lib/usStates';
import BottomSheet from './BottomSheet';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// Parses a comma/space-separated list of state codes into a deduped array
// of valid two-letter codes, dropping anything that isn't a real state --
// this is what drives Phase 3's globe state-highlight for a carrier with
// no booked lane history yet.
function parseStates(text) {
  const found = String(text || '')
    .toUpperCase()
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => US_STATES.includes(s));
  return [...new Set(found)];
}

function blankHistoryEntry() {
  return { origin_city: '', origin_state: '', dest_city: '', dest_state: '', rate: '', driver_name: '', driver_phone: '', comment: '', ran_at: '' };
}

function CarrierSheet({ carrier, onClose, onSaved }) {
  const isEditing = Boolean(carrier);
  const [companyName, setCompanyName] = useState(carrier?.company_name ?? '');
  const [mcNumber, setMcNumber] = useState(carrier?.mc_number ?? '');
  const [dispatcherName, setDispatcherName] = useState(carrier?.dispatcher_name ?? '');
  const [dispatcherPhone, setDispatcherPhone] = useState(carrier?.dispatcher_phone ?? '');
  const [dispatcherEmail, setDispatcherEmail] = useState(carrier?.dispatcher_email ?? '');
  const [equipmentTypes, setEquipmentTypes] = useState(() => (Array.isArray(carrier?.equipment_types) ? carrier.equipment_types : []));
  const [equipmentNotes, setEquipmentNotes] = useState(carrier?.equipment_notes ?? '');
  const [operatingStatesText, setOperatingStatesText] = useState(() => (Array.isArray(carrier?.operating_states) ? carrier.operating_states.join(', ') : ''));
  const [operatingNotes, setOperatingNotes] = useState(carrier?.operating_notes ?? '');
  const [comment, setComment] = useState(carrier?.comment ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState(isEditing ? 'loading' : 'n/a');
  const [addingHistory, setAddingHistory] = useState(false);
  const [historyDraft, setHistoryDraft] = useState(blankHistoryEntry());
  const [historyError, setHistoryError] = useState(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    listCarrierHistory(carrier.id)
      .then((data) => {
        if (isMountedRef.current) {
          setHistory(data);
          setHistoryStatus('ready');
        }
      })
      .catch(() => {
        if (isMountedRef.current) setHistoryStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleEquipment(code) {
    setEquipmentTypes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function handleSave() {
    setError(null);
    const trimmedCompany = companyName.trim();
    if (!trimmedCompany) {
      setError('Company name is required.');
      return;
    }

    const payload = {
      company_name: trimmedCompany,
      mc_number: blankToNull(mcNumber),
      dispatcher_name: blankToNull(dispatcherName),
      dispatcher_phone: blankToNull(dispatcherPhone),
      dispatcher_email: blankToNull(dispatcherEmail),
      equipment_types: equipmentTypes,
      equipment_notes: blankToNull(equipmentNotes),
      operating_states: parseStates(operatingStatesText),
      operating_notes: blankToNull(operatingNotes),
      comment: blankToNull(comment),
    };

    setSaving(true);
    const request = isEditing ? updateCarrier(carrier.id, payload) : createCarrier(payload);
    request
      .then((saved) => {
        if (isMountedRef.current) {
          onSaved(saved);
          onClose();
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to save the carrier.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setSaving(false);
        }
      });
  }

  function handleAddHistory() {
    setHistoryError(null);
    if (!historyDraft.origin_city.trim() || !historyDraft.origin_state.trim() || !historyDraft.dest_city.trim() || !historyDraft.dest_state.trim()) {
      setHistoryError('Origin and destination city/state are required.');
      return;
    }
    setHistoryBusy(true);
    createCarrierHistory(carrier.id, {
      origin_city: historyDraft.origin_city.trim(),
      origin_state: historyDraft.origin_state.trim(),
      dest_city: historyDraft.dest_city.trim(),
      dest_state: historyDraft.dest_state.trim(),
      rate: blankToNull(historyDraft.rate) === null ? null : Number(historyDraft.rate),
      driver_name: blankToNull(historyDraft.driver_name),
      driver_phone: blankToNull(historyDraft.driver_phone),
      comment: blankToNull(historyDraft.comment),
      ran_at: blankToNull(historyDraft.ran_at),
    })
      .then((created) => {
        if (isMountedRef.current) {
          setHistory((prev) => [created, ...prev]);
          setHistoryDraft(blankHistoryEntry());
          setAddingHistory(false);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setHistoryError(err.message || 'Failed to add the lane.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setHistoryBusy(false);
        }
      });
  }

  function handleDeleteHistory(id) {
    deleteCarrierHistory(id).then(() => {
      if (isMountedRef.current) {
        setHistory((prev) => prev.filter((entry) => entry.id !== id));
      }
    });
  }

  return (
    <AnimatePresence>
      <BottomSheet onClose={onClose}>
        <h2 className="mb-4 text-lg font-semibold text-text">{isEditing ? `Edit ${carrier.company_name}` : 'Add a carrier'}</h2>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-company">
              Company name
            </label>
            <input
              id="carrier-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-mc">
              MC number
            </label>
            <input
              id="carrier-mc"
              value={mcNumber}
              onChange={(e) => setMcNumber(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-dispatcher-phone">
              Dispatcher phone
            </label>
            <input
              id="carrier-dispatcher-phone"
              value={dispatcherPhone}
              onChange={(e) => setDispatcherPhone(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-dispatcher-email">
              Dispatcher email
            </label>
            <input
              id="carrier-dispatcher-email"
              type="email"
              value={dispatcherEmail}
              onChange={(e) => setDispatcherEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-dispatcher-name">
              Dispatcher name
            </label>
            <input
              id="carrier-dispatcher-name"
              value={dispatcherName}
              onChange={(e) => setDispatcherName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Equipment</label>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => toggleEquipment(option.code)}
                aria-pressed={equipmentTypes.includes(option.code)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  equipmentTypes.includes(option.code) ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-surface-alt text-text-muted'
                }`}
              >
                {option.code}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-equipment-notes">
            Equipment notes
          </label>
          <textarea
            id="carrier-equipment-notes"
            value={equipmentNotes}
            onChange={(e) => setEquipmentNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-operating-states">
            Operating states (comma-separated, e.g. TX, OK, AR)
          </label>
          <input
            id="carrier-operating-states"
            value={operatingStatesText}
            onChange={(e) => setOperatingStatesText(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-operating-notes">
            Where they operate (notes)
          </label>
          <textarea
            id="carrier-operating-notes"
            value={operatingNotes}
            onChange={(e) => setOperatingNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-comment">
            Comment
          </label>
          <textarea
            id="carrier-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        {isEditing && (
          <div className="mb-4 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Lane history</label>
              {!addingHistory && (
                <button type="button" onClick={() => setAddingHistory(true)} className="text-xs font-medium text-accent hover:underline">
                  + Add a lane
                </button>
              )}
            </div>

            {historyStatus === 'loading' && <p className="text-sm text-text-muted">Loading...</p>}
            {historyStatus === 'ready' && history.length === 0 && !addingHistory && (
              <p className="text-sm text-text-muted">No lanes logged yet.</p>
            )}
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
                  <span>
                    {entry.origin_city}, {entry.origin_state} → {entry.dest_city}, {entry.dest_state}
                    {entry.rate ? ` — $${Number(entry.rate).toLocaleString()}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHistory(entry.id)}
                    aria-label={`Remove lane ${entry.origin_city}, ${entry.origin_state} to ${entry.dest_city}, ${entry.dest_state}`}
                    className="text-xs text-error hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {addingHistory && (
              <div className="mt-3 rounded-lg border border-border p-3">
                {historyError && (
                  <p role="alert" className="mb-2 text-xs text-error">
                    {historyError}
                  </p>
                )}
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    aria-label="Origin city"
                    placeholder="Origin city"
                    value={historyDraft.origin_city}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, origin_city: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Origin state"
                    placeholder="Origin state"
                    value={historyDraft.origin_state}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, origin_state: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Destination city"
                    placeholder="Destination city"
                    value={historyDraft.dest_city}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, dest_city: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Destination state"
                    placeholder="Destination state"
                    value={historyDraft.dest_state}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, dest_state: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Rate"
                    placeholder="Rate"
                    value={historyDraft.rate}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, rate: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Date"
                    type="date"
                    value={historyDraft.ran_at}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, ran_at: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Driver name"
                    placeholder="Driver name (optional)"
                    value={historyDraft.driver_name}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, driver_name: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Driver phone"
                    placeholder="Driver phone (optional)"
                    value={historyDraft.driver_phone}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, driver_phone: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                </div>
                <textarea
                  aria-label="Lane comment"
                  placeholder="Comment (optional)"
                  value={historyDraft.comment}
                  onChange={(e) => setHistoryDraft((prev) => ({ ...prev, comment: e.target.value }))}
                  rows={2}
                  className="mb-2 w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                />
                <div className="flex justify-end gap-2">
                  <SecondaryButton
                    onClick={() => {
                      setAddingHistory(false);
                      setHistoryDraft(blankHistoryEntry());
                      setHistoryError(null);
                    }}
                    className="px-3 py-1 text-xs"
                  >
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton onClick={handleAddHistory} disabled={historyBusy} className="px-3 py-1 text-xs">
                    {historyBusy ? 'Adding...' : 'Add lane'}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        </div>
      </BottomSheet>
    </AnimatePresence>
  );
}

export default CarrierSheet;
