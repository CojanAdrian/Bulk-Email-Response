// The main action: an off-white pill with black text.
function PrimaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink transition-[scale,background-color,opacity] duration-300 ease-spring hover:bg-accent-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:min-h-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
