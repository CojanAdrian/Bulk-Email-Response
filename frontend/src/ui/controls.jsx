import { useId } from 'react';
import { motion } from 'framer-motion';

// An on/off switch.
export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors duration-300 disabled:opacity-50 ${checked ? 'bg-success' : 'bg-white/[0.14]'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-[translate] duration-500 ease-spring ${checked ? 'translate-x-[18px]' : ''}`}
      />
    </button>
  );
}

// A number with minus / plus buttons. format turns the number into text.
export function Stepper({ value, onChange, step = 1, min = 0, max = Infinity, format = String, label }) {
  const set = (next) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center rounded-full bg-white/[0.08] p-1">
      <button
        type="button"
        aria-label={`Less ${label}`}
        onClick={() => set(value - step)}
        className="grid h-[30px] w-[30px] place-items-center rounded-full text-[17px] text-text-muted transition-[scale,background-color] duration-300 ease-spring hover:bg-white/[0.12] hover:text-text active:scale-[0.85]"
      >
        −
      </button>
      <output aria-live="polite" className="min-w-[78px] text-center text-[15px] font-semibold tabular-nums">
        {format(value)}
      </output>
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => set(value + step)}
        className="grid h-[30px] w-[30px] place-items-center rounded-full text-[17px] text-text-muted transition-[scale,background-color] duration-300 ease-spring hover:bg-white/[0.12] hover:text-text active:scale-[0.85]"
      >
        +
      </button>
    </div>
  );
}

// A row of choices with a white pill that slides to the chosen one.
export function Segmented({ label, value, onChange, options }) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-full bg-white/[0.08] p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`relative isolate rounded-full px-3.5 py-[7px] text-[12.5px] font-medium transition-colors ${selected ? 'font-semibold text-black' : 'text-text-muted hover:text-text'}`}
          >
            {selected && <motion.span layoutId={`${group}-pill`} transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 -z-10 rounded-full bg-accent" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// A goal ring: value out of goal, filled with a spring when it changes.
export function Ring({ value, goal, size = 96, label }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="9" className="stroke-white/[0.08]" />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={progress >= 1 ? 'stroke-success' : 'stroke-text'}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ type: 'spring', stiffness: 60, damping: 14, delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden="true">
        <b className="text-[34px] font-bold leading-none tracking-[-0.05em]">{value}</b>
        <small className="text-[11.5px] text-text-muted">of {goal}</small>
      </div>
    </div>
  );
}

// A small line chart that draws itself. values: numbers, nulls are gaps
// drawn as zero.
export function Sparkline({ values, width = 120, height = 44, label }) {
  const points = values.map((v) => (v === null || v === undefined ? 0 : Number(v)));
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((v, i) => [i * step, height - 4 - (v / max) * (height - 8)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height}Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible" style={{ width, height }} role="img" aria-label={label}>
      <motion.path d={area} className="fill-white/[0.07]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.8 }} />
      <motion.path
        d={line}
        fill="none"
        className="stroke-text"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: [0.32, 0.72, 0, 1], delay: 0.4 }}
      />
    </svg>
  );
}

// Small bars that grow in one after another. highlight: how many of the
// last bars to colour.
export function Bars({ values, width = 120, height = 44, highlight = 0, label }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[5px]" style={{ width, height }} role="img" aria-label={label}>
      {values.map((value, index) => (
        <motion.i
          key={index}
          className={`block flex-1 rounded-[3px] ${index >= values.length - highlight ? 'bg-success' : 'bg-white/[0.22]'}`}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(4, (value / max) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 16, delay: 0.5 + index * 0.05 }}
        />
      ))}
    </div>
  );
}
