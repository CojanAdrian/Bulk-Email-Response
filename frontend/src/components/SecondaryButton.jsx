function SecondaryButton({ children, className = '', ...rest }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-control-border bg-control px-5 py-2.5 text-sm font-semibold text-text shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition duration-200 ease-smooth hover:bg-control-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:min-h-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default SecondaryButton;
