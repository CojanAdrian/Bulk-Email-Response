// Decorative only -- two soft colour glows (violet top-left, teal
// bottom-right) drifting very slowly behind the glass. motion-safe keeps
// them static when the OS has "reduce motion" on.
function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full blur-3xl motion-safe:animate-aurora-drift-a"
        style={{ background: 'var(--glow-a)' }}
      />
      <div
        className="absolute -bottom-48 -right-40 h-[38rem] w-[38rem] rounded-full blur-3xl motion-safe:animate-aurora-drift-b"
        style={{ background: 'var(--glow-b)' }}
      />
    </div>
  );
}

export default AuroraBackground;
