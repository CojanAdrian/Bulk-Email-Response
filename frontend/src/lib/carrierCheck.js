import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { candidateMcs, normalizeMc } from './mcNumbers';

// Highway checks for carriers, through the MC Check browser extension
// (Gmail-Highway-Extension). The extension does the lookups in this browser
// with your Highway login, the same as its Gmail and DAT tags; this file
// talks to it with window.postMessage (see its src/app-bridge.js).

export const EXTENSION_URL = 'https://github.com/CojanAdrian/Gmail-Highway-Extension';
export const highwayUrl = (mc) => `https://highway.com/broker/carriers/search-results?q=${encodeURIComponent(mc)}`;

const DETECT_MS = 2000;

let state = { extension: 'unknown', version: null, loginNeeded: false, picked: new Map(), results: new Map(), dat: new Map() };
const listeners = new Set();
const waiting = []; // lookups asked for before the extension answered
let started = false;

function set(change) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

function toExtension(msg) {
  window.postMessage({ source: 'bulkposting', ...msg }, window.location.origin);
}

function onMessage(event) {
  if (event.source !== window || !event.data || event.data.source !== 'mc-check') return;
  const msg = event.data;
  if (msg.type === 'ready') {
    const first = state.extension !== 'present';
    set({ extension: 'present', version: msg.version || null, loginNeeded: Boolean(msg.loginNeeded) });
    if (first) waiting.splice(0).forEach(toExtension);
  } else if (msg.type === 'picked') {
    set({ picked: new Map(state.picked).set(msg.key, msg.mc ?? null) });
  } else if (msg.type === 'result' && msg.mc) {
    set({ results: new Map(state.results).set(msg.mc, msg.result) });
  } else if (msg.type === 'login') {
    set({ loginNeeded: Boolean(msg.needed) });
  } else if (msg.type === 'dat-carriers') {
    const dat = new Map(state.dat);
    for (const carrier of msg.carriers || []) if (carrier && carrier.mc) dat.set(carrier.mc, carrier);
    set({ dat });
  }
}

export function startCarrierCheck() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('message', onMessage);
  toExtension({ type: 'hello' });
  setTimeout(() => {
    if (state.extension === 'unknown') set({ extension: 'absent' });
  }, DETECT_MS);
}

// Asks for the Highway result of the first usable MC# in mcs.
export function requestCheck(key, mcs, { force = false } = {}) {
  startCarrierCheck();
  if (!mcs.length) return;
  if (force) {
    const picked = state.picked.get(key);
    if (picked) {
      const results = new Map(state.results);
      results.delete(picked);
      set({ results });
    }
  }
  const msg = { type: 'lookup', key, mcs, force };
  if (state.extension === 'present') toExtension(msg);
  else waiting.push(msg);
}

export function openOnHighway(mc) {
  if (state.extension === 'present') toExtension({ type: 'open-highway', mc: mc || null });
  else window.open(mc ? highwayUrl(mc) : 'https://highway.com/broker/', '_blank', 'noopener');
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => state;

// The MC#s of an inquiry, best first: found by the server in the full email,
// or, for older inquiries, in the subject and the saved start of the email.
export function inquiryMcs(inquiry) {
  const saved = String(inquiry.carrier_mcs || '')
    .split(',')
    .map(normalizeMc)
    .filter(Boolean);
  return saved.length ? saved : candidateMcs(inquiry.subject || '', inquiry.body_snippet || '');
}

// What to show for one carrier: view is one of no-extension, checking,
// login, nomc, pass, partial, fail, not_found, error, other.
export function describeCheck(current, key, mcs) {
  if (current.extension === 'absent') return { view: 'no-extension', mc: mcs[0] || null };
  if (!mcs.length) return { view: 'nomc', mc: null };
  if (!current.picked.has(key)) return { view: 'checking', mc: mcs[0] };
  const mc = current.picked.get(key);
  if (!mc) return { view: 'nomc', mc: null };
  const result = current.results.get(mc);
  if (!result) return { view: current.loginNeeded ? 'login' : 'checking', mc };
  const known = ['pass', 'partial', 'fail', 'not_found', 'error'];
  return { view: known.includes(result.status) ? result.status : 'other', mc, result };
}

export function useCarrierCheck(inquiry) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const key = `inquiry-${inquiry.id}`;
  const mcs = useMemo(() => inquiryMcs(inquiry), [inquiry]);
  const mcsKey = mcs.join(',');
  useEffect(() => {
    requestCheck(key, mcs);
    // mcsKey stands for mcs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mcsKey]);
  return { ...describeCheck(current, key, mcs), recheck: () => requestCheck(key, mcs, { force: true }) };
}

// Carriers the extension saw in DAT truck searches since a time (ms).
export function requestDatCarriers(since) {
  startCarrierCheck();
  const msg = { type: 'dat-list', since };
  if (state.extension === 'present') toExtension(msg);
  else waiting.push(msg);
}

// The live carrier-check state, for screens that need all of it.
export function useCarrierCheckState() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// For tests.
export function resetCarrierCheck() {
  if (typeof window !== 'undefined') window.removeEventListener('message', onMessage);
  started = false;
  waiting.length = 0;
  state = { extension: 'unknown', version: null, loginNeeded: false, picked: new Map(), results: new Map(), dat: new Map() };
  listeners.forEach((listener) => listener());
}
