import { forwardRef } from 'react';

// The floating panel on the left of every screen: a large number, what it
// counts, an optional action, then the screen's own tabs, tools and list.
// pushedBack: something opened on top of it, so it recedes and cannot be
// reached.
const ScreenPanel = forwardRef(function ScreenPanel(
  { label, count, caption, title, action, tabs, toolbar, children, footer, pushedBack = false, onPointerLeave },
  ref
) {
  return (
    <section
      aria-label={label}
      inert={pushedBack ? '' : undefined}
      className={`mat relative mx-3 mb-28 mt-2 flex min-h-[70vh] origin-[50%_55%] flex-col overflow-hidden rounded-[30px] transition-[scale,filter] duration-700 ease-soft motion-safe:animate-[rise-in_1.1s_var(--spring)_both] md:fixed md:bottom-[104px] md:left-9 md:top-[84px] md:z-10 md:m-0 md:min-h-0 md:w-[540px] ${
        pushedBack ? 'scale-95 brightness-[0.45]' : ''
      }`}
    >
      <header className="flex items-end gap-3.5 px-7 pt-[26px]">
        <p className="text-[84px] font-bold leading-[0.8] tracking-[-0.065em] tabular-nums" aria-hidden="true">
          {count}
        </p>
        <div className="min-w-0 pb-1">
          <p className="caps truncate">{caption}</p>
          <h1 className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.02em]">
            <span className="sr-only">{count} </span>
            {title}
          </h1>
        </div>
        {action && <div className="mb-1 ml-auto shrink-0">{action}</div>}
      </header>
      {tabs && <div className="flex flex-wrap items-center gap-x-5 border-b border-white/[0.07] px-7 pt-5">{tabs}</div>}
      {toolbar && <div className="flex flex-wrap items-center gap-2 px-5 pt-3">{toolbar}</div>}
      <div ref={ref} onPointerLeave={onPointerLeave} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3.5 pt-2 [scrollbar-width:none]">
        {children}
      </div>
      {footer && <div className="px-3">{footer}</div>}
    </section>
  );
});

export default ScreenPanel;

// A round "+" in the panel header.
export function PlusButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full bg-accent text-[22px] font-light text-accent-ink transition-[scale,rotate] duration-500 ease-spring hover:rotate-90 hover:scale-110"
    >
      +
    </button>
  );
}

// The underlined tabs along the panel header.
export function PanelTabs({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="flex gap-5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`-mb-px border-b-[1.5px] pb-3 text-[13px] font-medium transition-colors ${
            value === option.value ? 'border-text text-text' : 'border-transparent text-text/30 hover:text-text-muted'
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1.5 tabular-nums opacity-60">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Small rounded filter chips under the panel search.
export function Chips({ label, value, onChange, options, className = '' }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            value === option.value ? 'bg-white/[0.12] text-text' : 'text-text-muted hover:text-text'
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1 tabular-nums opacity-60">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const TOOL_BUTTON = 'rounded-full px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-white/10 hover:text-text';

// The rounded search field under the panel header.
export function PanelSearch({ label, placeholder, value, onChange }) {
  return (
    <label className="relative min-w-[10rem] flex-1">
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        type="search"
        aria-label={label}
        data-hotkey-search
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-full border py-2 pl-9 pr-3 text-[13px] text-text"
      />
    </label>
  );
}

// A quiet line for an empty list.
export function EmptyNote({ title, children }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-base font-semibold text-text">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-xs text-sm text-text-muted">{children}</p>}
    </div>
  );
}
