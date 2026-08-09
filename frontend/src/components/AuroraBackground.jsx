// Decorative only -- a fixed, blurred, slowly-drifting gradient layer behind
// the shell. motion-safe: keeps every animation off when the visitor's OS
// has prefers-reduced-motion enabled (the blobs still render, just static).
function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full bg-accent/25 blur-3xl motion-safe:animate-aurora-drift-a" />
      <div className="absolute -right-24 top-1/4 h-[28rem] w-[28rem] rounded-full bg-[#3b4b8f]/30 blur-3xl motion-safe:animate-aurora-drift-b" />
      <div className="absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full bg-[#d4af61]/20 blur-3xl motion-safe:animate-aurora-drift-c" />
    </div>
  );
}

export default AuroraBackground;
