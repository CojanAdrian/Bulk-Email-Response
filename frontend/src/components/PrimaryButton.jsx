// Lime fill with dark ink text -- lime is only ever a fill, never text.
function PrimaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-[0_4px_14px_rgba(215,255,61,0.28)] transition duration-200 ease-smooth hover:bg-accent-strong hover:shadow-[0_6px_20px_rgba(215,255,61,0.4)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent disabled:active:scale-100 sm:min-h-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
