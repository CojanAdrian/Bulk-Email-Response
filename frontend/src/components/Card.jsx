import { forwardRef } from 'react';

// Frosted-glass panel -- the base container for every section. See the
// .glass utility in index.css.
const Card = forwardRef(function Card({ children, className = '', ...rest }, ref) {
  return (
    <div ref={ref} className={`glass min-w-0 rounded-3xl p-4 text-text sm:p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
});

export default Card;
