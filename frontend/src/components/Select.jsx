import { useEffect, useId, useRef, useState } from 'react';
import ListboxPanel from './ListboxPanel';
import { ChevronDownIcon } from './icons';
import { useListboxNav } from '../lib/useListboxNav';

const SIZES = {
  sm: 'min-h-[36px] px-3 py-1 text-xs sm:min-h-[30px]',
  md: 'min-h-[44px] px-3.5 py-2 text-sm sm:min-h-[38px]',
};

// The app's dropdown -- replaces every native <select>. A button trigger
// (chevron inside the pill, so it never pokes out of a rounded edge) that
// opens a themed list. Keyboard: Up/Down/Enter/Space open it, arrows move,
// Enter picks, Escape closes, and typing a letter jumps to the first
// option starting with it -- same as a native select, but readable.
//
// onChange receives the chosen option's value (not an event).
function Select({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  placeholder = 'Choose…',
  size = 'md',
  disabled = false,
  className = '',
  variant = 'default',
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const listId = `${useId()}-list`;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function pick(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    if (option.value !== value) onChange(option.value);
  }

  const nav = useListboxNav({ count: options.length, open, setOpen, onPick: pick });

  // Opening highlights the current choice, like a native select.
  useEffect(() => {
    if (open) nav.setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target) && !document.getElementById(listId)?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, listId]);

  function handleKeyDown(event) {
    if (disabled) return;
    if (!open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (open && event.key === ' ') {
      event.preventDefault();
      pick(nav.activeIndex);
      return;
    }
    if (nav.handleKeyDown(event)) return;
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const start = open ? nav.activeIndex + 1 : selectedIndex + 1;
      const order = [...options.slice(start), ...options.slice(0, start)];
      const hit = order.find((o) => String(o.label).toLowerCase().startsWith(letter));
      if (hit) {
        const index = options.indexOf(hit);
        if (open) nav.setActiveIndex(index);
        else pick(index);
      }
    }
  }

  const tone =
    variant === 'onDark'
      ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
      : 'border-border bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:border-text-muted/50';

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && nav.activeIndex >= 0 ? `${listId}-opt-${nav.activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        className={`inline-flex min-w-0 max-w-full items-center justify-between gap-2 rounded-full border font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${tone} ${
          open ? 'ring-2 ring-focus/60' : ''
        } ${className}`}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-text-muted'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon aria-hidden="true" className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ListboxPanel
          id={listId}
          anchorEl={triggerRef.current}
          ariaLabel={ariaLabel}
          options={options}
          activeIndex={nav.activeIndex}
          selectedValue={value}
          onPick={pick}
          onHover={nav.setActiveIndex}
        />
      )}
    </>
  );
}

export default Select;
