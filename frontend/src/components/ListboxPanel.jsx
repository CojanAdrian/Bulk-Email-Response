import { useEffect, useRef } from 'react';
import PopoverPanel from './PopoverPanel';
import { CheckIcon } from './icons';

// The one dropdown list every picker in the app renders: portaled (never
// clipped by a card or modal), solid surface (no grey-on-grey glass), the
// keyboard-highlighted row clearly marked and kept scrolled into view.
//
// options: [{ value, label, hint?, disabled? }]
function ListboxPanel({ id, anchorEl, options, activeIndex, selectedValue, onPick, onHover, emptyText = 'No matches', ariaLabel, footer }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <PopoverPanel
      anchorEl={anchorEl}
      matchWidth
      // Keeps focus in the input/trigger while clicking an option, so the
      // field doesn't blur (and close the list) before the click lands.
      onMouseDown={(e) => e.preventDefault()}
      className="max-w-[min(26rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-surface text-text shadow-[0_18px_50px_rgba(0,0,0,0.45)] ring-1 ring-black/5"
    >
      <ul ref={listRef} id={id} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto overscroll-contain p-1">
        {options.length === 0 && <li className="px-3 py-2.5 text-sm text-text-muted">{emptyText}</li>}
        {options.map((option, index) => {
          const active = index === activeIndex;
          const selected = selectedValue !== undefined && option.value === selectedValue;
          return (
            <li
              key={option.value}
              id={`${id}-opt-${index}`}
              data-index={index}
              role="option"
              aria-selected={selected}
              aria-disabled={option.disabled || undefined}
              onMouseEnter={() => onHover && onHover(index)}
              onClick={() => !option.disabled && onPick(index)}
              className={`flex min-h-[40px] cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-100 sm:min-h-0 ${
                active ? 'bg-accent text-accent-ink' : 'text-text hover:bg-surface-alt'
              } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{option.label}</span>
                {option.hint && ' '}
                {option.hint && <span className={`ml-1 ${active ? 'text-accent-ink/70' : 'text-text-muted'}`}>{option.hint}</span>}
              </span>
              {selected && <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" />}
            </li>
          );
        })}
      </ul>
      {footer}
    </PopoverPanel>
  );
}

export default ListboxPanel;
