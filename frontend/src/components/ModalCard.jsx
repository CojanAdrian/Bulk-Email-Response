import { forwardRef } from 'react';

// The rounded/bordered/shadowed shell every centered modal uses -- same
// look as Card, but split into an outer shell (overflow-hidden) and an
// inner scrollable body. Putting overflow-y-auto and rounded-3xl on the
// very same element (what a plain Card did) let a tall form's native
// scrollbar render as a straight bar poking past the rounded corners
// instead of being clipped by them. The inner body has no radius of its
// own, so overflow-hidden on the outer shell clips its scrollbar to the
// shell's rounded shape.
// `footer` (Save / Cancel) is rendered OUTSIDE the scrolling body, pinned
// to the bottom of the card on its own solid background -- the form
// scrolls above it instead of showing through behind the buttons.
const ModalCard = forwardRef(function ModalCard({ children, className = '', bodyClassName = '', maxHeight = '85vh', footer = null, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={`flex w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface text-text shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:rounded-3xl ${className}`}
      style={{ maxHeight }}
      {...rest}
    >
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 ${footer ? '' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'} ${bodyClassName}`}>
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-3">
          {footer}
        </div>
      )}
    </div>
  );
});

export default ModalCard;
