function Card({ children, className = '', ...rest }) {
  return (
    <div className={`rounded-xl border border-border border-t-[3px] border-t-gold bg-surface p-6 shadow-sm ${className}`} {...rest}>
      {children}
    </div>
  );
}

export default Card;
