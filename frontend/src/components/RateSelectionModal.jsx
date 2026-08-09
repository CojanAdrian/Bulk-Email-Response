import { useState } from 'react';

function RateSelectionModal({ loads, onCancel, onConfirm }) {
  const [overrides, setOverrides] = useState(() =>
    Object.fromEntries(loads.map((l) => [l.id, { include: true, value: l.target_pay ?? '' }]))
  );

  const allChecked = loads.length > 0 && loads.every((l) => overrides[l.id] && overrides[l.id].include);

  function toggleAll(checked) {
    setOverrides((prev) => {
      const next = { ...prev };
      loads.forEach((l) => {
        next[l.id] = { ...next[l.id], include: checked };
      });
      return next;
    });
  }

  function toggleOne(id, checked) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], include: checked } }));
  }

  function setValue(id, value) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], value } }));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-selection-title"
      className="fixed inset-0 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 id="rate-selection-title" className="mb-4 text-lg font-semibold text-slate-100">
          Choose loads to include a rate on
        </h2>
        <table className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500">
              <th className="py-2 pr-4">
                <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all" />
              </th>
              <th className="py-2 pr-4">Order #</th>
              <th className="py-2 pr-4">Route</th>
              <th className="py-2">Rate</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={Boolean(overrides[l.id] && overrides[l.id].include)}
                    onChange={(e) => toggleOne(l.id, e.target.checked)}
                    aria-label={`Include rate for ${l.load_number}`}
                  />
                </td>
                <td className="py-2 pr-4">{l.load_number}</td>
                <td className="py-2 pr-4">
                  {l.origin_city}, {l.origin_state} → {l.dest_city}, {l.dest_state}
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    value={overrides[l.id] ? overrides[l.id].value : ''}
                    onChange={(e) => setValue(l.id, e.target.value)}
                    aria-label={`Rate for ${l.load_number}`}
                    className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-right text-slate-100"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(overrides)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Generate export
          </button>
        </div>
      </div>
    </div>
  );
}

export default RateSelectionModal;
