import { useState } from 'react';
import { useInstallApp } from '../lib/installApp';

const PERKS = [
  ['Its own window', 'A taskbar and Start menu icon, Alt+Tab straight to it, no tabs or address bar.'],
  ['As fast as the browser', 'It runs on your browser’s engine, so the board and map move at full speed.'],
  ['Light', 'No separate program: it shares what your browser already runs.'],
  ['Always up to date', 'It is BulkPosting itself, so every update arrives on its own. MC Check Highway checks keep working.'],
];

const MANUAL = [
  ['Brave or Chrome', 'Click the install icon at the right end of the address bar, or open the ⋮ menu → Cast, save and share → Install page as app.'],
  ['Edge', 'Open the … menu → Apps → Install BulkPosting.'],
];

// Settings > Install app.
export function InstallApp() {
  const { state, install } = useInstallApp();
  const [declined, setDeclined] = useState(false);

  if (state === 'installed') {
    return (
      <div className="flex items-center gap-4 border-t border-white/[0.07] py-5">
        <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-[16px]" />
        <div>
          <p className="text-[15px] font-semibold">You are using the BulkPosting app.</p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">It updates by itself. To remove it, right-click its icon in the Start menu and choose Uninstall.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.07] pt-5">
      <div className="flex flex-wrap items-center gap-5 rounded-[24px] bg-white/[0.045] p-5 ring-1 ring-inset ring-white/[0.07]">
        <img src="/icon-192.png" alt="" className="h-[72px] w-[72px] rounded-[20px] shadow-[0_12px_40px_rgba(0,0,0,0.6)]" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-[19px] font-bold tracking-[-0.03em]">BulkPosting app</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">Install it from your browser in one click. Nothing to download.</p>
        </div>
        {state === 'ready' && (
          <button
            type="button"
            onClick={async () => setDeclined(!(await install()))}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-black transition-transform duration-300 ease-spring hover:scale-[1.04] active:scale-95"
          >
            Install BulkPosting
          </button>
        )}
      </div>
      {declined && <p className="mt-2 px-1 text-[12px] text-text-muted">Not installed. You can install it any time from here.</p>}

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {PERKS.map(([title, detail], index) => (
          <li key={title} className="rounded-[18px] bg-white/[0.03] px-4 py-3 motion-safe:animate-[rise-in_700ms_var(--spring)_both]" style={{ animationDelay: `${index * 60}ms` }}>
            <p className="text-[13.5px] font-semibold">{title}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{detail}</p>
          </li>
        ))}
      </ul>

      {state === 'manual' && (
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <p className="text-[13.5px] font-semibold">Install from your browser’s menu</p>
          <ul className="mt-2 space-y-2">
            {MANUAL.map(([browser, how]) => (
              <li key={browser} className="text-[12.5px] leading-snug text-text-muted">
                <span className="font-semibold text-text">{browser}:</span> {how}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
