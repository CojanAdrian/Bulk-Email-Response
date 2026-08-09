import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { updateLoad } from '../api/loads';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';

const MotionCard = motion(Card);

function RateModal({ load, onClose, onSaved }) {
  const preset = useMotionPreset();
  const [targetPay, setTargetPay] = useState(load.target_pay ?? '');
  const [status, setStatus] = useState(load.status);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  function handleSave() {
    setError(null);

    const trimmed = String(targetPay).trim();
    let normalizedTargetPay = null;
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) {
        setError('Target pay must be a number.');
        return;
      }
      normalizedTargetPay = parsed;
    }

    setSaving(true);
    updateLoad(load.id, { target_pay: normalizedTargetPay, status })
      .then((updated) => {
        if (isMountedRef.current) {
          onSaved(updated);
          onClose();
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to save.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setSaving(false);
        }
      });
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-modal-title"
      className="fixed inset-0 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      {...preset.modal.backdrop}
    >
      <MotionCard className="w-full max-w-sm" {...preset.modal.card}>
        <h2 id="rate-modal-title" className="mb-4 text-lg font-semibold text-text">
          Edit load {load.load_number}
        </h2>
        <label className="mb-1 block text-sm text-text-muted" htmlFor="targetPay">
          Target pay
        </label>
        <input
          id="targetPay"
          type="number"
          step="0.01"
          value={targetPay}
          onChange={(e) => setTargetPay(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text"
        />
        <label className="mb-1 block text-sm text-text-muted" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text"
        >
          <option value="active">Active</option>
          <option value="booked">Booked</option>
          <option value="expired">Expired</option>
        </select>
        {error && (
          <p role="alert" className="mb-4 text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        </div>
      </MotionCard>
    </motion.div>
  );
}

export default RateModal;
