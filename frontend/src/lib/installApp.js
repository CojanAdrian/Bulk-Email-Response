import { useEffect, useState } from 'react';

// Installing BulkPosting as an app from the browser (Brave, Chrome, Edge):
// its own window and taskbar icon, running on the browser's engine.
// The browser offers it once per page load ("beforeinstallprompt"), so the
// offer is caught as soon as this file loads and kept for the Install button.

let offer = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function isInstalledApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    notify();
  });
}

// 'installed' (running as the app), 'ready' (the browser can install it
// now) or 'manual' (use the browser's menu).
export function useInstallApp() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const state = isInstalledApp() ? 'installed' : offer ? 'ready' : 'manual';
  async function install() {
    if (!offer) return false;
    const current = offer;
    current.prompt();
    const choice = await current.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') offer = null;
    notify();
    return choice?.outcome === 'accepted';
  }
  return { state, install };
}

// For tests.
export function setInstallOffer(event) {
  offer = event;
  notify();
}
