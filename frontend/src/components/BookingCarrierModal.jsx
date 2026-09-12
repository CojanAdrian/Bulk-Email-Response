import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';
import BookingCarrierFields from './BookingCarrierFields';
import Card from './Card';
import SecondaryButton from './SecondaryButton';

const MotionCard = motion(Card);

// Pops up as soon as a load's status is switched to "booked" (see
// LoadsTable's status dropdown) instead of the carrier-logging step being
// buried in the Edit-load modal, where it's easy to miss. Skippable --
// BookingCarrierFields itself is the one making the actual save, this is
// just the framing around it.
function BookingCarrierModal({ load, onClose }) {
  const preset = useMotionPreset();
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-carrier-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      {...preset.modal.backdrop}
    >
      <MotionCard className="w-full max-w-lg" {...preset.modal.card}>
        <h2 id="booking-carrier-modal-title" className="mb-1 text-lg font-semibold text-text">
          Who's running load {load.load_number}?
        </h2>
        <p className="mb-4 text-sm text-text-muted">Marked as booked -- log the carrier now, or skip and add it later from the load.</p>
        <BookingCarrierFields
          loadId={load.id}
          originCity={load.origin_city}
          originState={load.origin_state}
          destCity={load.dest_city}
          destState={load.dest_state}
          targetPay={load.target_pay}
        />
        <div className="flex justify-end">
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </MotionCard>
    </motion.div>
  );
}

export default BookingCarrierModal;
