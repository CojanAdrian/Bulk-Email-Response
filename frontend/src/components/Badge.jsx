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
    // shrink-0 + whitespace-nowrap: a badge inside a flex row (very common
    // -- see LoadsTable's row header) otherwise defaults to a shrinkable
    // flex item and can get squeezed narrower than its own text, pushing
    // the label past the rounded-pill background instead of the pill
    // growing to fit it.
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${variantClasses} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Badge;
