import { motion } from 'framer-motion';
import RelativeTime from '../../components/RelativeTime';
import SelectionCircle from '../../components/SelectionCircle';
import { SHEET_SPRING } from '../../ui/Sheet';
import { detectMultiStop } from '../../lib/lookupMessage';
import { STATUS_LABELS, senderName } from './inquiryText';

const STATUS_TONE = {
  pending_review: 'bg-hot/15 text-hot',
  auto_sent: 'bg-success/15 text-success',
  sent: 'bg-success/15 text-success',
  rejected: 'bg-white/[0.08] text-text-muted',
  none: 'bg-white/[0.08] text-text-muted',
};

// One email on the Inquiries list. Waiting ones show how long they have
// waited; the rest show what happened to them.
function InquiryRow({ inquiry, showStatus, current, selecting, selected, onOpen, onHover, onToggleSelect }) {
  const lane = inquiry.matched_load_origin_city && inquiry.matched_load_dest_city ? `${inquiry.matched_load_origin_city} → ${inquiry.matched_load_dest_city}` : null;
  const multiStop = detectMultiStop({ comment: inquiry.matched_load_comment, stops: inquiry.matched_load_stops });
  const waiting = inquiry.reply_status === 'pending_review';

  function activate() {
    if (selecting) onToggleSelect(inquiry.id);
    else onOpen(inquiry);
  }

  return (
    <li data-testid="inquiry-row" data-row-id={inquiry.id} onPointerEnter={() => onHover(inquiry)}>
      <motion.div
        layoutId={`inquiry-${inquiry.id}`}
        transition={SHEET_SPRING}
        role="button"
        tabIndex={0}
        aria-label={`Open inquiry from ${inquiry.from_address}: ${inquiry.subject || 'no subject'}`}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            activate();
          }
        }}
        className={`relative grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-x-3 rounded-[18px] px-[18px] py-[13px] outline-none transition-colors duration-200 hover:bg-white/[0.065] focus-visible:bg-white/[0.065] ${
          current || selected ? 'bg-white/[0.065]' : ''
        }`}
      >
        {waiting && <span aria-hidden="true" className="absolute bottom-4 left-1.5 top-4 w-0.5 rounded-full bg-hot shadow-[0_0_12px_rgb(var(--color-hot))]" />}
        <span className="flex pt-0.5" onClick={(event) => event.stopPropagation()}>
          {selecting && <SelectionCircle selected={selected} onToggle={() => onToggleSelect(inquiry.id)} ariaLabel={`Select inquiry from ${inquiry.from_address}`} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-text">{senderName(inquiry.from_address)}</p>
          <p className="mt-0.5 truncate text-[13px] text-text-muted">{inquiry.subject || 'No subject'}</p>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] text-text-muted">
            {inquiry.matched_load_id ? (
              <span className="truncate">
                <span className="text-text">{inquiry.matched_load_load_number}</span>
                {lane && <span> · {lane}</span>}
              </span>
            ) : (
              <span className="text-hot">No load matched</span>
            )}
            {Boolean(inquiry.ref_mismatch) && <span className="rounded-full bg-hot/15 px-2 py-px font-medium text-hot">Different load?</span>}
            {multiStop && <span className="rounded-full bg-hot/15 px-2 py-px font-medium text-hot">{multiStop}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <RelativeTime value={inquiry.received_at} className="text-[11.5px] font-medium" />
          {showStatus && <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${STATUS_TONE[inquiry.reply_status] || STATUS_TONE.none}`}>{STATUS_LABELS[inquiry.reply_status] || inquiry.reply_status}</span>}
        </div>
      </motion.div>
    </li>
  );
}

export default InquiryRow;
