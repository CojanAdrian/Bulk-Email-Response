import Card from './Card';

// Compact KPI tile -- three fit side by side even on a phone.
function StatTile({ label, value, accentClassName = 'text-text' }) {
  return (
    <Card className="min-w-0 flex-1 !p-3 sm:!p-4">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:text-xs" title={label}>
        {label}
      </p>
      <p className={`mt-0.5 break-words font-display text-lg font-bold leading-tight tabular-nums sm:mt-1 sm:text-2xl ${accentClassName}`}>{value}</p>
    </Card>
  );
}

export default StatTile;
