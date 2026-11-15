import { EXTENSION_URL, openOnHighway } from '../../lib/carrierCheck';

// How each Highway outcome looks: a short label for rows, a headline and a
// line of advice for the opened inquiry.
const LOOK = {
  pass: { short: 'Pass', title: 'Passes your Highway rules', advice: 'Good to work with.', tone: 'text-[rgb(96,165,250)]', fill: 'bg-[rgba(96,165,250,0.15)]', ring: 'ring-[rgba(96,165,250,0.35)]', icon: 'check' },
  partial: { short: 'Partial', title: 'Partially passes', advice: 'Review the carrier on Highway before you book.', tone: 'text-success', fill: 'bg-success/15', ring: 'ring-success/30', icon: 'half' },
  fail: { short: 'Fail', title: 'Fails your Highway rules', advice: 'Do not book this carrier.', tone: 'text-hot', fill: 'bg-hot/15', ring: 'ring-hot/40', icon: 'cross' },
  not_found: { short: 'Not on Highway', title: 'Not on Highway', advice: 'No carrier with this MC# on Highway. Ask them to set up.', tone: 'text-warning', fill: 'bg-warning/10', ring: 'ring-warning/25', icon: 'question' },
  other: { short: 'Check', title: 'Unusual assessment', advice: 'Open it on Highway to see why.', tone: 'text-warning', fill: 'bg-warning/10', ring: 'ring-warning/25', icon: 'question' },
  checking: { short: 'Highway…', title: 'Checking Highway…', advice: 'Results usually take a few seconds.', tone: 'text-text-muted', fill: 'bg-white/[0.06]', ring: 'ring-white/10', icon: 'spin' },
  login: { short: 'Log in to Highway', title: 'Log in to Highway', advice: 'Your Highway session ended. Log in and the check carries on by itself.', tone: 'text-warning', fill: 'bg-warning/10', ring: 'ring-warning/25', icon: 'key' },
  error: { short: 'Check failed', title: 'The Highway check failed', advice: 'Try again in a moment.', tone: 'text-warning', fill: 'bg-warning/10', ring: 'ring-warning/25', icon: 'question' },
  nomc: { short: 'No MC#', title: 'No MC# in this email', advice: 'Ask the carrier for their MC# to check them.', tone: 'text-text-muted', fill: 'bg-white/[0.05]', ring: 'ring-white/10', icon: 'dash' },
};

function Glyph({ name, className = '' }) {
  if (name === 'spin') {
    return <span aria-hidden="true" className={`inline-block animate-spin rounded-full border-[1.5px] border-current border-r-transparent ${className}`} />;
  }
  const paths = {
    check: 'M4 8.5l2.6 2.5L12 5.5',
    cross: 'M5 5l6 6M11 5l-6 6',
    half: 'M8 3.2a4.8 4.8 0 010 9.6z',
    question: 'M6.2 6.2a1.9 1.9 0 113 1.6c-.7.4-1.2.8-1.2 1.6M8 11.6v.1',
    key: 'M9.5 6.5a2.5 2.5 0 11-1 2L4 13M5.5 11.5l1 1',
    dash: 'M5 8h6',
  };
  return (
    <svg viewBox="0 0 16 16" fill={name === 'half' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {name === 'half' && <circle cx="8" cy="8" r="4.8" fill="none" />}
      <path d={paths[name]} />
    </svg>
  );
}

// The compact Highway badge on an inquiry row. Nothing when the extension
// is not installed (the opened inquiry explains how to add it).
export function CarrierBadge({ check }) {
  if (check.view === 'no-extension') return null;
  const look = LOOK[check.view] || LOOK.other;
  const label = check.view === 'other' && check.result?.label ? check.result.label : look.short;
  const tip = check.mc ? `Highway: ${look.title}${check.result?.name ? ` · ${check.result.name}` : ''} · MC ${check.mc}` : look.title;
  return (
    <span title={tip} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[11px] font-bold ring-1 ring-inset ${look.fill} ${look.tone} ${look.ring}`}>
      <Glyph name={look.icon} className="h-3 w-3" />
      {label}
    </span>
  );
}

function checkedAt(result) {
  if (!result?.checkedAt) return null;
  return new Date(result.checkedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// The carrier's Highway check in the opened inquiry.
export function CarrierCheckCard({ check }) {
  if (check.view === 'no-extension') {
    return (
      <section aria-label="Highway check" className="mt-5 flex items-center gap-3 rounded-[18px] border border-dashed border-white/[0.14] px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-text-muted">
          <Glyph name="question" className="h-4 w-4" />
        </span>
        <p className="min-w-0 text-[12.5px] leading-snug text-text-muted">
          <span className="font-semibold text-text">See if this carrier passes your Highway rules.</span> Add the MC Check extension to this browser and Highway results show up here.{' '}
          <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="font-semibold text-text underline-offset-2 hover:underline">
            Get MC Check
          </a>
        </p>
      </section>
    );
  }

  const look = LOOK[check.view] || LOOK.other;
  const headline = check.view === 'other' && check.result?.label ? `Highway says: ${check.result.label}` : look.title;
  const when = checkedAt(check.result);
  const details = [check.result?.name, check.mc && `MC ${check.mc}`, when && `checked ${when}`].filter(Boolean);
  const canRecheck = ['pass', 'partial', 'fail', 'not_found', 'other', 'error'].includes(check.view);

  return (
    <section aria-label="Highway check" className={`mt-5 flex items-center gap-3.5 rounded-[18px] px-4 py-3.5 ring-1 ring-inset ${look.fill} ${look.ring}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/30 ${look.tone}`}>
        <Glyph name={look.icon} className={look.icon === 'spin' ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="caps">Highway check</p>
        <p className={`mt-0.5 text-[16px] font-bold tracking-[-0.02em] ${look.tone}`}>{headline}</p>
        <p className="mt-0.5 text-[12px] text-text-muted">
          {details.length ? `${details.join(' · ')}. ` : ''}
          {look.advice}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {(check.mc || check.view === 'login') && (
          <button type="button" onClick={() => openOnHighway(check.view === 'login' ? null : check.mc)} className="rounded-full bg-white px-3 py-1 text-[11.5px] font-bold text-black transition-transform hover:scale-[1.04]">
            {check.view === 'login' ? 'Log in' : 'Open on Highway'}
          </button>
        )}
        {canRecheck && (
          <button type="button" onClick={check.recheck} className="text-[11.5px] font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline">
            Check again
          </button>
        )}
      </div>
    </section>
  );
}
