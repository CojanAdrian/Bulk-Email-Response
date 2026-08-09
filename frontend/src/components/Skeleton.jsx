function Skeleton({ count = 1, height = '1rem', width = '100%', className = '' }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-block"
          className={`animate-pulse rounded-lg bg-surface-alt ${className}`}
          style={{ height, width }}
        />
      ))}
    </div>
  );
}

export default Skeleton;
