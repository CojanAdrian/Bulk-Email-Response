import { forwardRef } from 'react';

const Card = forwardRef(function Card({ children, className = '', ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={`rounded-3xl border border-border bg-surface p-6 shadow-[0_8px_30px_rgba(10,11,16,0.08)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;
