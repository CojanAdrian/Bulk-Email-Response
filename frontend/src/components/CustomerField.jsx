import { useEffect, useId, useState } from 'react';
import { listCustomers } from '../api/customers';

// Shared across every open form so the customer list is fetched once per
// page load, not once per modal.
let cachedNames = null;
let pending = null;

function loadCustomerNames() {
  if (cachedNames) return Promise.resolve(cachedNames);
  if (!pending) {
    pending = Promise.resolve(listCustomers())
      .then((list) => {
        cachedNames = (Array.isArray(list) ? list : []).map((c) => c.name);
        return cachedNames;
      })
      .catch(() => [])
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function resetCustomerNameCache() {
  cachedNames = null;
  pending = null;
}

// Free-text customer input with suggestions from customers already in the
// system (a native <datalist>), so "ALDI, Inc" isn't retyped as "Aldi inc".
function CustomerField({ id = 'customer', value, onChange, label = 'Customer', className = '' }) {
  const [names, setNames] = useState(cachedNames || []);
  const listId = `${useId()}-customers`;

  useEffect(() => {
    let cancelled = false;
    loadCustomerNames().then((list) => {
      if (!cancelled) setNames(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        placeholder="e.g. ALDI, Inc"
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted"
      />
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}

export default CustomerField;
