import { useEffect, useRef, useState } from 'react';

// Text you click to copy. It turns green and says "Copied" for a moment.
// Shows the value itself unless children are given. The click never
// reaches whatever row or card it sits in.
function CopyText({ value, label, className = '', children }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (value === null || value === undefined || value === '') return null;

  function copy(event) {
    event.stopPropagation();
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1100);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label || `Copy ${value}`}
      title={label || `Copy ${value}`}
      className={`-mx-[7px] rounded-md px-[7px] py-px tabular-nums transition-colors duration-200 ${
        copied ? 'bg-success text-black' : 'text-text-muted hover:bg-white/[0.12] hover:text-text'
      } ${className}`}
    >
      {copied ? 'Copied' : children ?? value}
      <span className="sr-only" role="status">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}

export default CopyText;
