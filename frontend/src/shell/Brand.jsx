function Brand() {
  return (
    <div className="flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.03em] text-shell-text">
      <span aria-hidden="true" className="relative h-[18px] w-[18px] rounded-full border-2 border-shell-text">
        <span className="absolute inset-[3px] rounded-full bg-shell-text" />
      </span>
      <span className="hidden sm:inline">bulkposting</span>
    </div>
  );
}

export default Brand;
