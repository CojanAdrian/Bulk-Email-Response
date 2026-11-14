import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { listLoads } from '../api/loads';
import { listCarriers } from '../api/carriers';
import { listCustomers } from '../api/customers';
import { formatMoney } from '../lib/formatMoney';

const LIMIT = 6;

function score(text, query) {
  const haystack = String(text || '').toLowerCase();
  if (!query) return 1;
  if (haystack.startsWith(query)) return 3;
  if (haystack.includes(` ${query}`)) return 2;
  return haystack.includes(query) ? 1 : 0;
}

function search(data, query) {
  const q = query.trim().toLowerCase();
  const pick = (rows, text) =>
    rows
      .map((row) => ({ row, score: score(text(row), q) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT)
      .map((hit) => hit.row);
  const loads = pick(data.loads, (l) => `${l.load_number} ${l.origin_city} ${l.origin_state} ${l.dest_city} ${l.dest_state} ${l.customer || ''}`).map((l) => ({
    kind: 'Load',
    key: `load-${l.id}`,
    to: `/loads/${l.id}`,
    title: `${l.origin_city || '?'}, ${l.origin_state || ''} → ${l.dest_city || '?'}, ${l.dest_state || ''}`,
    meta: l.load_number,
    side: l.target_pay ? formatMoney(l.target_pay) : l.status,
  }));
  const carriers = pick(data.carriers, (c) => `${c.company_name} ${c.mc_number || ''} ${c.dispatcher_name || ''}`).map((c) => ({
    kind: 'Carrier',
    key: `carrier-${c.id}`,
    to: `/carriers/${c.id}`,
    title: c.company_name,
    meta: c.mc_number ? `MC ${c.mc_number}` : c.dispatcher_name || '',
    side: c.dispatcher_phone || '',
  }));
  const customers = pick(data.customers, (c) => c.name).map((c) => ({
    kind: 'Customer',
    key: `customer-${c.name}`,
    to: `/customers/${encodeURIComponent(c.name)}`,
    title: c.name,
    meta: `${c.loadCount} load${c.loadCount === 1 ? '' : 's'}`,
    side: '',
  }));
  return [...loads, ...carriers, ...customers];
}

// Ctrl K: one field over every load, carrier and customer. Arrows move,
// Enter opens.
function SearchPalette({ onClose, onGo }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ loads: [], carriers: [], customers: [] });
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef(null);

  useEffect(() => {
    let ignore = false;
    Promise.allSettled([listLoads(), listCarriers(), listCustomers()]).then(([loads, carriers, customers]) => {
      if (ignore) return;
      const value = (result) => (result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
      setData({ loads: value(loads), carriers: value(carriers), customers: value(customers) });
      setReady(true);
    });
    input.current?.focus();
    return () => {
      ignore = true;
    };
  }, []);

  const results = useMemo(() => search(data, query), [data, query]);
  useEffect(() => setSelected(0), [query]);

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (event.key === 'Enter' && results[selected]) {
      event.preventDefault();
      onGo(results[selected].to);
    }
  }

  return (
    <>
      <motion.div className="fixed inset-0 z-[50] bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-sheet
        initial={{ opacity: 0, scale: 0.92, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="mat fixed left-1/2 top-[18vh] z-[51] w-[min(660px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[28px] text-text"
      >
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search loads, carriers and customers"
          aria-controls="search-results"
          aria-activedescendant={results[selected] ? `search-${results[selected].key}` : undefined}
          placeholder="Find a load, carrier or customer"
          spellCheck="false"
          className="block w-full !border-0 !bg-transparent px-[26px] py-[22px] text-[26px] font-medium tracking-[-0.03em] !shadow-none outline-none"
        />
        <ul id="search-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto border-t border-white/[0.07] p-2 [scrollbar-width:none]">
          {!ready && <li className="px-4 py-3 text-[13px] text-text-muted">Loading...</li>}
          {ready && results.length === 0 && <li className="px-4 py-3 text-[13px] text-text-muted">Nothing matches.</li>}
          {results.map((result, index) => (
            <li
              key={result.key}
              id={`search-${result.key}`}
              role="option"
              aria-selected={index === selected}
              onPointerEnter={() => setSelected(index)}
              onClick={() => onGo(result.to)}
              className={`flex cursor-pointer items-center gap-3.5 rounded-[16px] px-4 py-[11px] text-[15px] font-medium tracking-[-0.015em] ${index === selected ? 'bg-accent text-black' : ''}`}
            >
              <span className={`w-[64px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] ${index === selected ? 'text-black/50' : 'text-text-muted'}`}>{result.kind}</span>
              <span className="min-w-0 flex-1 truncate">{result.title}</span>
              <span className={`shrink-0 text-[12px] tabular-nums ${index === selected ? 'text-black/60' : 'text-text-muted'}`}>{[result.meta, result.side].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </>
  );
}

export default SearchPalette;
