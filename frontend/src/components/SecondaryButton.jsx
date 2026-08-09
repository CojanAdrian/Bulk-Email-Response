function SecondaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`rounded-full border border-border bg-surface-alt px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-border active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default SecondaryButton;
