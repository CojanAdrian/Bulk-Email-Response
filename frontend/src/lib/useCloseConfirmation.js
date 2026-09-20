import { useRef, useState } from 'react';

// Intercepts a close action when the caller reports unsaved changes,
// surfacing an inline "discard changes?" confirmation instead of closing
// immediately -- used by every modal/sheet in the app so leaving with
// unsaved edits is never silent. Pair with useDirtyGuard for the "has
// anything changed" half of this.
export function useCloseConfirmation() {
  const [confirming, setConfirming] = useState(false);
  const pendingCloseRef = useRef(null);

  function requestClose(isDirty, onClose) {
    if (!isDirty) {
      onClose();
      return;
    }
    pendingCloseRef.current = onClose;
    setConfirming(true);
  }

  function confirmDiscard() {
    setConfirming(false);
    const close = pendingCloseRef.current;
    pendingCloseRef.current = null;
    if (close) close();
  }

  function cancelDiscard() {
    setConfirming(false);
  }

  return { confirming, requestClose, confirmDiscard, cancelDiscard };
}
