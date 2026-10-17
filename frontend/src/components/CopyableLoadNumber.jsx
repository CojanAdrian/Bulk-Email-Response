import { useEffect, useRef, useState } from 'react';
import { CopyIcon, CheckIcon } from './icons';

// A load number you can click to copy -- the same chip everywhere a load
// number appears (the board, a carrier's lane history, ...). Copies just
// the number, then shows a check for a moment.
function CopyableLoadNumber({ loadNumber, label = '#', className = '' }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (loadNumber === null || loadNumber === undefined || loadNumber === '') return null;

  function copy(event) {
    // Never also trigger whatever row/card this chip sits in.
    event.stopPropagation();
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(String(loadNumber)).then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy load number ${loadNumber}`}
      title="Copy load number"
      className={`group inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-control-border bg-control px-2 py-0.5 font-mono text-[13px] font-bold tracking-wide text-text transition hover:bg-control-hover active:scale-[0.97] ${className}`}
    >
      <span aria-hidden="true" className="text-text-muted">
        {label}
      </span>
      <span>{loadNumber}</span>
      {copied ? (
        <CheckIcon aria-hidden="true" className="h-3.5 w-3.5 text-success" />
      ) : (
        <CopyIcon aria-hidden="true" className="h-3.5 w-3.5 opacity-50 transition group-hover:opacity-100" />
      )}
      <span className="sr-only" role="status">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}

export default CopyableLoadNumber;
