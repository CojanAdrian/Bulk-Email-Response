function PrimaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-[0_4px_14px_rgba(215,255,61,0.35)] transition hover:bg-accent-strong hover:shadow-[0_6px_20px_rgba(215,255,61,0.45)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent disabled:active:scale-100 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
