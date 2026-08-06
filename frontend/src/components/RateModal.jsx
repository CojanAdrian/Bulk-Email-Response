import { useState } from 'react';
import { updateLoad } from '../api/loads';

function RateModal({ load, onClose, onSaved }) {
  const [targetPay, setTargetPay] = useState(load.target_pay ?? '');
  const [status, setStatus] = useState(load.status);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    setError(null);
    setSaving(true);
    updateLoad(load.id, { target_pay: targetPay, status })
      .then((updated) => {
        onSaved(updated);
        onClose();
      })
      .catch((err) => {
        setError(err.message || 'Failed to save.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Edit load {load.load_number}</h2>
        <label className="mb-1 block text-sm text-slate-400" htmlFor="targetPay">
          Target pay
        </label>
        <input
          id="targetPay"
          value={targetPay}
          onChange={(e) => setTargetPay(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        />
        <label className="mb-1 block text-sm text-slate-400" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        >
          <option value="active">Active</option>
          <option value="booked">Booked</option>
          <option value="expired">Expired</option>
        </select>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RateModal;
