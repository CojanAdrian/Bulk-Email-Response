import CopyText from '../ui/CopyText';

// Where the Windows installer is published (GitHub Releases of this repo).
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/CojanAdrian/Bulk-Email-Response/releases/latest/download/BulkPosting-Setup.exe';
const SIZE = '83 MB';

// "BulkPostingDesktop/1.0.0" in the user agent: this page is open inside the
// desktop app.
export function desktopVersion(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const match = String(userAgent).match(/BulkPostingDesktop\/([\d.]+)/);
  return match ? match[1] : null;
}

function WindowsMark({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
      <path d="M1 2.6l5.7-.8v5.6H1zM7.4 1.7L15 .6v6.8H7.4zM1 8.1h5.7v5.6L1 12.9zM7.4 8.1H15v7.3l-7.6-1.1z" />
    </svg>
  );
}

const STEPS = [
  ['Open the downloaded file', 'It installs in a few seconds and adds BulkPosting to your desktop and Start menu.'],
  ['If Windows says "Windows protected your PC"', 'Click More info, then Run anyway. The app is not signed with a paid certificate yet, so Windows warns about it once.'],
  ['Enter this address when the app asks', null],
];

// Settings > Download app.
export function DesktopDownload() {
  const version = desktopVersion();
  const address = typeof window === 'undefined' ? '' : window.location.origin;

  if (version) {
    return (
      <div className="flex items-center gap-4 border-t border-white/[0.07] py-5">
        <img src="/app-icon.png" alt="" className="h-14 w-14 rounded-[16px]" />
        <div>
          <p className="text-[15px] font-semibold">You are using the desktop app.</p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Version {version}. Ctrl+Shift+A changes the address it opens; Ctrl+R reloads.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.07] pt-5">
      <div className="flex flex-wrap items-center gap-5 rounded-[24px] bg-white/[0.045] p-5 ring-1 ring-inset ring-white/[0.07]">
        <img src="/app-icon.png" alt="" className="h-[72px] w-[72px] rounded-[20px] shadow-[0_12px_40px_rgba(0,0,0,0.6)]" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-[19px] font-bold tracking-[-0.03em]">BulkPosting for Windows</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">Its own window and taskbar icon, desktop notifications for new inquiries, and the same loads, inquiries and Gmail as here.</p>
        </div>
        <a
          href={DESKTOP_DOWNLOAD_URL}
          download
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-black transition-transform duration-300 ease-spring hover:scale-[1.04] active:scale-95"
        >
          <WindowsMark className="h-3.5 w-3.5" />
          Download for Windows
        </a>
      </div>
      <p className="mt-2 px-1 text-[11.5px] text-text-muted">Windows 10 or 11 · {SIZE}</p>

      <ol className="mt-5 space-y-3.5">
        {STEPS.map(([title, detail], index) => (
          <li key={title} className="flex gap-3.5 motion-safe:animate-[rise-in_700ms_var(--spring)_both]" style={{ animationDelay: `${index * 60}ms` }}>
            <span className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-white/[0.1] text-[11px] font-bold">{index + 1}</span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">{title}</p>
              {detail ? (
                <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{detail}</p>
              ) : (
                <p className="mt-1 text-[12.5px] text-text-muted">
                  <CopyText value={address} label="Copy this address" className="mx-0 font-mono text-text" />
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 border-t border-white/[0.07] pt-4 text-[12px] leading-snug text-text-muted">
        The Highway checks on Inquiries come from the MC Check browser extension, so they show in the browser, not in the desktop app.
      </p>
    </div>
  );
}
