function SecondaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-border bg-surface-alt px-5 py-2.5 text-sm font-semibold text-text transition duration-200 ease-smooth hover:border-text-muted/40 hover:bg-border active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:min-h-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default SecondaryButton;
