import { StarIcon } from './icons';

// The gold "this exact lane has been run before" pill.
function ProvenBadge({ count, compact = false, className = '' }) {
  if (!count) return null;
  const full = `${count} carrier${count === 1 ? '' : 's'} ran this`;
  return (
    <span
      aria-label={`Proven lane: ${full}`}
      title={`Proven lane: ${full} before`}
      className={`gold-pill inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-[0_0_12px_rgba(251,191,36,0.35)] ${className}`}
    >
      <StarIcon className="h-3 w-3" aria-hidden="true" />
      {compact ? `${count} ran it` : full}
    </span>
  );
}

export default ProvenBadge;
