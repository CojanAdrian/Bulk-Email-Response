import { useNavigate } from 'react-router-dom';
import RelativeTime from '../../components/RelativeTime';

const SHOWN = 3;

function senderName(fromAddress) {
  const text = String(fromAddress || '');
  const named = text.match(/^\s*"?([^"<]+?)"?\s*</);
  return (named ? named[1] : text).trim() || 'Unknown sender';
}

// The newest inquiries waiting on a reply, beside the board.
// Hovering one points the map at the load it is about.
function NeedsReply({ inquiries, onHoverLoad }) {
  const navigate = useNavigate();
  if (!inquiries.length) return null;
  const extra = inquiries.length - SHOWN;
  const newest = [...inquiries].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));

  return (
    <section aria-label="Inquiries waiting for a reply">
      <h2 className="caps mb-2.5 flex justify-between">
        <span>Needs a reply</span>
        <span className="text-hot">{inquiries.length}</span>
      </h2>
      <ul className="space-y-2">
        {newest.slice(0, SHOWN).map((inquiry, index) => (
          <li key={inquiry.id} style={{ animationDelay: `${index * 90}ms` }} className="motion-safe:animate-[slide-in_900ms_var(--spring)_both]">
            <button
              type="button"
              onClick={() => navigate(`/inquiries/${inquiry.id}`)}
              onPointerEnter={() => onHoverLoad(inquiry.matched_load_id ?? null)}
              onPointerLeave={() => onHoverLoad(null)}
              className="mat block w-full rounded-[20px] px-4 py-[13px] text-left transition-[scale,translate] duration-300 ease-spring hover:-translate-x-1.5 hover:scale-[1.03]"
            >
              <span className="flex items-baseline justify-between gap-3 text-[12.5px] font-semibold text-text">
                <span className="truncate">{senderName(inquiry.from_address)}</span>
                <RelativeTime value={inquiry.received_at} className="shrink-0 text-[11.5px] font-medium" />
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-text-muted">{inquiry.subject || 'No subject'}</span>
            </button>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <button type="button" onClick={() => navigate('/inquiries')} className="mt-2 px-1 text-xs text-text-muted hover:text-text">
          and {extra} more
        </button>
      )}
    </section>
  );
}

export default NeedsReply;
