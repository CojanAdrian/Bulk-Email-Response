function SecondaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`rounded-lg border-2 border-accent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent hover:text-surface disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default SecondaryButton;
