import { useRef } from 'react';

// Reports whether `values` has changed since the hook first mounted, by
// deep-equality via JSON serialization -- good enough for the plain
// string/number/array-of-plain-objects form state every modal in this app
// uses, and avoids hand-writing a field-by-field comparison per caller.
// See useCloseConfirmation for the "what to do about it" half of this.
export function useDirtyGuard(values) {
  const initialRef = useRef(JSON.stringify(values));
  return JSON.stringify(values) !== initialRef.current;
}
