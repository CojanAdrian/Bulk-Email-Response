import { useState } from 'react';

function EyeIcon({ open, ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  );
}

// Password field with a show/hide toggle and a Caps Lock warning -- the two
// things that cause most "wrong password" retries. The toggle's name avoids
// the word "password" so the field's own label stays unambiguous.
function PasswordInput({ className = '', onKeyUp, onKeyDown, onBlur, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const hintId = inputProps.id ? `${inputProps.id}-caps` : undefined;

  function readCaps(event) {
    if (typeof event.getModifierState === 'function') setCapsLock(event.getModifierState('CapsLock'));
  }

  return (
    <div className={className}>
      <div className="relative">
        <input
          {...inputProps}
          type={visible ? 'text' : 'password'}
          onKeyUp={(e) => {
            readCaps(e);
            onKeyUp?.(e);
          }}
          onKeyDown={(e) => {
            readCaps(e);
            onKeyDown?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
          aria-describedby={[inputProps['aria-describedby'], capsLock ? hintId : null].filter(Boolean).join(' ') || undefined}
          className="w-full rounded-xl border border-border bg-surface-alt py-2.5 pl-3 pr-11 text-text outline-none transition focus:border-focus"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide characters' : 'Show characters'}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface hover:text-text"
        >
          <EyeIcon open={visible} className="h-4 w-4" />
        </button>
      </div>
      {capsLock && (
        <p id={hintId} className="mt-1 text-xs font-medium text-warning">
          Caps Lock is on
        </p>
      )}
    </div>
  );
}

export default PasswordInput;
