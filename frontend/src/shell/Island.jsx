import { useNavigate } from 'react-router-dom';

const IDLE_SIZE = { width: 204, height: 38 };
const NOTICE_SIZE = { width: 400, height: 38 };
const OPEN_SIZE = { width: 440, height: 164 };

// The pill at the top of the window. At rest it shows the inbox state; when
// an inquiry arrives it springs open with who wrote and what about. A
// notice ({ tone, title, detail }) widens it for a short confirmation.
function Island({ inquiry = null, onDismiss, notice = null, pendingCount = 0, gmailConnected = null }) {
  const navigate = useNavigate();
  const open = inquiry !== null;
  const showNotice = !open && notice !== null;
  const size = open ? OPEN_SIZE : showNotice ? NOTICE_SIZE : IDLE_SIZE;
  const disconnected = gmailConnected === false;

  // Opens this exact inquiry, not just the list.
  function view() {
    onDismiss?.();
    navigate(inquiry?.id ? `/inquiries/${inquiry.id}` : '/inquiries');
  }

  return (
    <div
      style={{ width: size.width, height: size.height }}
      className={`relative max-w-[calc(100vw-9rem)] overflow-hidden bg-black shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.16),0_14px_50px_rgba(0,0,0,0.7)] transition-[width,height,border-radius] duration-[800ms] ease-spring motion-reduce:transition-none ${
        open ? 'rounded-[34px]' : 'rounded-[22px]'
      }`}
    >
      {showNotice && (
        <p role="status" className="absolute inset-0 flex items-center justify-between gap-3 px-[15px] text-xs font-medium">
          <span className="flex min-w-0 items-center gap-2 text-text">
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${notice.tone === 'error' ? 'bg-hot' : 'bg-success'}`} />
            <span className="truncate">{notice.title}</span>
          </span>
          {notice.detail && <span className="shrink-0 font-semibold text-text-muted">{notice.detail}</span>}
        </p>
      )}

      {!open && !showNotice && (
        <button
          type="button"
          onClick={() => navigate('/inquiries')}
          aria-label={`${disconnected ? 'Gmail not connected' : 'Inbox live'}${pendingCount > 0 ? `, ${pendingCount} waiting` : ''}. Open inquiries`}
          className="absolute inset-0 flex items-center justify-between gap-3 px-[15px] text-xs font-medium"
        >
          <span className="flex min-w-0 items-center gap-2 text-text-muted">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${disconnected ? 'bg-hot' : 'bg-success motion-safe:animate-pulse'}`}
            />
            <span className="truncate">{disconnected ? 'Gmail not connected' : 'Inbox live'}</span>
          </span>
          {pendingCount > 0 && <span className="shrink-0 font-semibold text-hot">{pendingCount} waiting</span>}
        </button>
      )}

      {open && (
        <div role="alert" className="absolute inset-0 flex flex-col px-5 py-[18px]">
          <button type="button" onClick={view} className="min-w-0 text-left">
            <p className="truncate text-sm text-text-muted">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-hot">New inquiry from</span>{' '}
              <b className="font-semibold text-text">{inquiry.from_address}</b>
            </p>
            <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-text-muted">{inquiry.subject || 'No subject'}</p>
          </button>
          <div className="mt-auto flex gap-2">
            <button
              type="button"
              onClick={view}
              className="flex-1 rounded-full bg-accent py-[9px] text-center text-[12.5px] font-semibold text-accent-ink transition-[scale] duration-300 ease-spring active:scale-95"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => onDismiss?.()}
              className="flex-1 rounded-full bg-white/[0.12] py-[9px] text-center text-[12.5px] font-semibold text-text transition-[scale] duration-300 ease-spring active:scale-95"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Island;
