function PrimaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`rounded-lg bg-gradient-to-br from-gold-light to-gold-dark px-4 py-2 text-sm font-semibold text-accent-strong shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
