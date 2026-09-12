import { useState } from 'react';
import { createCarrier, createCarrierHistory, lookupCarrierByMc } from '../api/carriers';
import PrimaryButton from './PrimaryButton';

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// Optional, skippable carrier-logging section shown when a load's status
// is set to "booked" -- saves straight into the carrier database (find-or-
// create by MC number/company name, then a new lane-history row tied to
// this load) so booking a load and building carrier history happen in one
// step instead of two. Independent of RateModal's own Save button -- this
// logs immediately on its own "Log carrier" click.
//
// Typing an MC number and tabbing out looks it up against the carrier
// database: an existing carrier (same MC on a prior load) autofills the
// rest of the form instead of making the user retype it; no match just
// means it's a new carrier and the fields stay blank to fill in.
function BookingCarrierFields({ loadId, originCity, originState, destCity, destState }) {
  const [companyName, setCompanyName] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [dispatcherName, setDispatcherName] = useState('');
  const [dispatcherPhone, setDispatcherPhone] = useState('');
  const [dispatcherEmail, setDispatcherEmail] = useState('');
  const [rate, setRate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState(null);
  const [mcLookupStatus, setMcLookupStatus] = useState('idle'); // 'idle' | 'checking' | 'found' | 'new'

  function handleMcBlur() {
    const mc = mcNumber.trim();
    if (!mc) {
      setMcLookupStatus('idle');
      return;
    }
    setMcLookupStatus('checking');
    lookupCarrierByMc(mc)
      .then((carrier) => {
        if (carrier) {
          setCompanyName(carrier.company_name || '');
          setDispatcherName(carrier.dispatcher_name || '');
          setDispatcherPhone(carrier.dispatcher_phone || '');
          setDispatcherEmail(carrier.dispatcher_email || '');
          setMcLookupStatus('found');
        } else {
          setMcLookupStatus('new');
        }
      })
      .catch(() => setMcLookupStatus('idle'));
  }

  function handleLogCarrier() {
    setError(null);
    const trimmedCompany = companyName.trim();
    if (!trimmedCompany) {
      setError('Company name is required to log the carrier.');
      return;
    }
    setStatus('saving');
    createCarrier({
      company_name: trimmedCompany,
      mc_number: blankToNull(mcNumber),
      dispatcher_name: blankToNull(dispatcherName),
      dispatcher_phone: blankToNull(dispatcherPhone),
      dispatcher_email: blankToNull(dispatcherEmail),
    })
      .then((carrier) =>
        createCarrierHistory(carrier.id, {
          load_id: loadId,
          origin_city: originCity,
          origin_state: originState,
          dest_city: destCity,
          dest_state: destState,
          rate: blankToNull(rate) === null ? null : Number(rate),
          driver_name: blankToNull(driverName),
          driver_phone: blankToNull(driverPhone),
          comment: blankToNull(comment),
          ran_at: new Date().toISOString().slice(0, 10),
        })
      )
      .then(() => setStatus('saved'))
      .catch((err) => {
        setStatus('error');
        setError(err.message || 'Failed to log the carrier.');
      });
  }

  if (status === 'saved') {
    return (
      <p className="mb-4 rounded-lg border border-success/40 bg-success-bg px-3 py-2 text-sm text-success">
        Carrier logged for this load.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Who ran this load?</p>
      {error && (
        <p role="alert" className="mb-2 text-xs text-error">
          {error}
        </p>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          aria-label="Carrier MC number"
          placeholder="MC number"
          value={mcNumber}
          onChange={(e) => setMcNumber(e.target.value)}
          onBlur={handleMcBlur}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Carrier company name"
          placeholder="Company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
      </div>
      {mcLookupStatus === 'checking' && <p className="mb-2 text-xs text-text-muted">Checking MC {mcNumber.trim()}...</p>}
      {mcLookupStatus === 'found' && (
        <p className="mb-2 text-xs font-medium text-success">Existing carrier found — details filled in below.</p>
      )}
      {mcLookupStatus === 'new' && <p className="mb-2 text-xs text-text-muted">New carrier — fill in their details below.</p>}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          aria-label="Dispatcher name"
          placeholder="Dispatcher name"
          value={dispatcherName}
          onChange={(e) => setDispatcherName(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Dispatcher phone"
          placeholder="Dispatcher phone"
          value={dispatcherPhone}
          onChange={(e) => setDispatcherPhone(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Dispatcher email"
          type="email"
          placeholder="Dispatcher email (optional)"
          value={dispatcherEmail}
          onChange={(e) => setDispatcherEmail(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Rate paid"
          placeholder="Rate"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Driver name"
          placeholder="Driver name (optional)"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Driver phone"
          placeholder="Driver phone (optional)"
          value={driverPhone}
          onChange={(e) => setDriverPhone(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
      </div>
      <textarea
        aria-label="Carrier comment"
        placeholder="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="mb-2 w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
      />
      <div className="flex justify-end">
        <PrimaryButton onClick={handleLogCarrier} disabled={status === 'saving'} className="px-3 py-1 text-xs">
          {status === 'saving' ? 'Logging...' : 'Log carrier'}
        </PrimaryButton>
      </div>
    </div>
  );
}

export default BookingCarrierFields;
