import { forwardRef } from 'react';

// The rounded/bordered/shadowed shell every centered modal uses -- same
// look as Card, but split into an outer shell (overflow-hidden) and an
// inner scrollable body. Putting overflow-y-auto and rounded-3xl on the
// very same element (what a plain Card did) let a tall form's native
// scrollbar render as a straight bar poking past the rounded corners
// instead of being clipped by them. The inner body has no radius of its
// own, so overflow-hidden on the outer shell clips its scrollbar to the
// shell's rounded shape.
const ModalCard = forwardRef(function ModalCard({ children, className = '', bodyClassName = '', maxHeight = '85vh', ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={`overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_8px_30px_rgba(10,11,16,0.08)] ${className}`}
      {...rest}
    >
      <div className={`overflow-y-auto p-6 ${bodyClassName}`} style={{ maxHeight }}>
        {children}
      </div>
    </div>
  );
});

export default ModalCard;
