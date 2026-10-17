import { useEffect, useRef } from 'react';

function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// Single-key shortcuts ("/", "n") that never fire while typing in a field,
// with a modifier held, or while a dialog is open.
export function useHotkeys(bindings) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const handler = bindingsRef.current[event.key];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

// Focuses the current page's main search box (marked data-hotkey-search).
export function focusPageSearch() {
  const input = document.querySelector('[data-hotkey-search]');
  if (input) {
    input.focus();
    if (typeof input.select === 'function') input.select();
  }
}
