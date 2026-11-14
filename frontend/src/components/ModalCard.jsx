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
// `style` is merged, not replaced: motion(ModalCard) passes its animation
// styles through it, which used to wipe out maxHeight -- a long form then
// grew past the screen and pushed Save / Cancel out of reach.
const ModalCard = forwardRef(function ModalCard({ children, className = '', bodyClassName = '', maxHeight = '85vh', footer = null, style, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={`mat flex w-full flex-col overflow-hidden rounded-t-[30px] text-text sm:rounded-[34px] ${className}`}
      style={{ ...style, maxHeight }}
      {...rest}
    >
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-width:none] sm:p-8 ${footer ? '' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'} ${bodyClassName}`}>
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-white/[0.07] bg-black/20 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-4">
          {footer}
        </div>
      )}
    </div>
  );
});

export default ModalCard;
