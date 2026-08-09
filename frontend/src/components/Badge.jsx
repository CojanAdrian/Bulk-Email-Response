const VARIANT_CLASSES = {
  default: 'bg-tag-bg text-tag',
  success: 'bg-success-bg text-success',
  error: 'bg-error-bg text-error',
  warning: 'bg-warning-bg text-warning',
};

function Badge({ children, variant = 'default', className = '' }) {
  const variantClasses = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${variantClasses} ${className}`}>
      {children}
    </span>
  );
}

export default Badge;
