const VARIANT_CLASSES = {
  default: 'bg-tag-bg text-tag',
  success: 'bg-success-bg text-success',
  error: 'bg-error-bg text-error',
  warning: 'bg-warning-bg text-warning',
  info: 'bg-info-bg text-info',
};

function Badge({ children, variant = 'default', className = '', ...rest }) {
  const variantClasses = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;
  return (
    // shrink-0: a badge inside a flex row (very common -- see LoadsTable's
    // row header) otherwise defaults to a shrinkable flex item and can get
    // squeezed narrower than its own text, pushing the label past the
    // rounded-pill background instead of the pill growing to fit it. Text
    // is allowed to wrap (no whitespace-nowrap) so a caller can cap a long
    // multi-word label with a max-w-* class to keep it from stretching a
    // table row wide -- it stacks onto a second line instead.
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-center text-xs font-semibold leading-tight ${variantClasses} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Badge;
