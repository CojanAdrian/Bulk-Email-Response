import { motion } from 'framer-motion';

export function StarIcon({ filled, className = '' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 1.6l1.95 4.1 4.45.55-3.27 3.08.84 4.42L8 11.6l-3.97 2.15.84-4.42L1.6 6.25l4.45-.55z" />
    </svg>
  );
}

// Marks a carrier as one of your own. Fills gold and pops when starred.
function StarButton({ starred, onToggle, name, size = 'md', disabled = false }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${name}` : `Star ${name}`}
      title={starred ? 'Starred: one of your own carriers' : 'Star this carrier'}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!starred);
      }}
      className={`grid ${box} shrink-0 place-items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
        starred ? 'bg-gold/15 text-gold hover:bg-gold/25' : 'text-text/30 hover:bg-white/10 hover:text-text'
      }`}
    >
      <motion.span key={String(starred)} initial={starred ? { scale: 0.4, rotate: -30 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 14 }} className="grid">
        <StarIcon filled={starred} className={icon} />
      </motion.span>
    </button>
  );
}

export default StarButton;
