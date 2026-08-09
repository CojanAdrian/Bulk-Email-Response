import { API_URL } from '../api/client';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];
const MAX_RECONNECT_DELAY_MS = 30000;
const STABLE_CONNECTION_MS = 5000;

let ws = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
let stableTimer = null;
let status = 'closed';
let manuallyDisconnected = true;

const eventHandlers = new Map(); // eventName -> Set<handler>
const statusHandlers = new Set();

function getWsUrl() {
  return API_URL.replace(/^http/, 'ws') + '/ws';
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  statusHandlers.forEach((handler) => handler(status));
}

function scheduleReconnect() {
  if (manuallyDisconnected) return;
  const delay = Math.min(RECONNECT_DELAYS_MS[reconnectAttempt] ?? MAX_RECONNECT_DELAY_MS, MAX_RECONNECT_DELAY_MS);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(connect, delay);
}

export function connect() {
  manuallyDisconnected = false;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);
  setStatus('connecting');

  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    setStatus('open');
    stableTimer = setTimeout(() => {
      reconnectAttempt = 0;
    }, STABLE_CONNECTION_MS);
  };

  ws.onmessage = (rawEvent) => {
    let parsed;
    try {
      parsed = JSON.parse(rawEvent.data);
    } catch {
      return;
    }
    const handlers = eventHandlers.get(parsed.event);
    if (handlers) handlers.forEach((handler) => handler(parsed.payload));
  };

  ws.onclose = () => {
    clearTimeout(stableTimer);
    if (manuallyDisconnected) {
      setStatus('closed');
    } else {
      setStatus('connecting');
      scheduleReconnect();
    }
  };
}

export function disconnect() {
  manuallyDisconnected = true;
  clearTimeout(reconnectTimer);
  clearTimeout(stableTimer);
  reconnectAttempt = 0;
  if (ws) {
    ws.close();
    ws = null;
  }
  setStatus('closed');
}

export function subscribe(eventName, handler) {
  if (!eventHandlers.has(eventName)) eventHandlers.set(eventName, new Set());
  eventHandlers.get(eventName).add(handler);
  return () => {
    eventHandlers.get(eventName)?.delete(handler);
  };
}

export function subscribeStatus(handler) {
  statusHandlers.add(handler);
  return () => statusHandlers.delete(handler);
}

export function getStatus() {
  return status;
}
