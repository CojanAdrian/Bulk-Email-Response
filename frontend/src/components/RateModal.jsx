import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { updateLoad, previewLoadReply } from '../api/loads';
import { useMotionPreset } from '../lib/motionConfig';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../lib/dateInput';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import ExtraStopsEditor from './ExtraStopsEditor';

const MotionCard = motion(Card);

const TEXT_FIELDS = [
  'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip',
  'equipment', 'weight', 'commodity', 'temperature', 'comment',
];

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function RateModal({ load, onClose, onSaved }) {
  const preset = useMotionPreset();
  const [fields, setFields] = useState(() =>
    Object.fromEntries(TEXT_FIELDS.map((field) => [field, load[field] ?? '']))
  );
  const [stops, setStops] = useState(load.stops ?? '');
  const [targetPay, setTargetPay] = useState(load.target_pay ?? '');
  const [earlyPu, setEarlyPu] = useState(isoToDatetimeLocal(load.early_pu));
  const [latePu, setLatePu] = useState(isoToDatetimeLocal(load.late_pu));
  const [lateDel, setLateDel] = useState(isoToDatetimeLocal(load.late_del));
  const [extraStops, setExtraStops] = useState(() =>
    Array.isArray(load.extra_stops)
      ? load.extra_stops.map((s) => ({ type: s.type, city: s.city ?? '', state: s.state ?? '', datetime: isoToDatetimeLocal(s.datetime) }))
      : []
  );
  const [status, setStatus] = useState(load.status);
  const [useCustomReply, setUseCustomReply] = useState(Boolean(load.custom_reply_body));
  const [customReplyText, setCustomReplyText] = useState(load.custom_reply_body ?? '');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Reset on every mount -- see GmailConnectionPanel.jsx for why this
    // matters under React 18 StrictMode's dev-only double-mount.
    isMountedRef.current = true;
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

  function handleFieldChange(field, value) {
    setFields((prev) => ({ ...prev, [field]: value }));
  }

  function handleToggleCustomReply(checked) {
    setUseCustomReply(checked);
    // Prefill from the auto-generated reply as a starting point (rather than
    // an empty box) so customizing is mostly additive -- e.g. adding the
    // extra stop lines for a multi-pick/multi-drop load -- not retyping
    // everything from scratch. Only fetches when there's no text yet.
    if (checked && !customReplyText.trim()) {
      setPreviewLoading(true);
      previewLoadReply(load.id)
        .then((res) => {
          if (isMountedRef.current) {
            setCustomReplyText(res.body || '');
          }
        })
        .catch(() => {
          // Best-effort prefill -- leave the textarea blank on failure, the
          // user can still type their own reply from scratch.
        })
        .finally(() => {
          if (isMountedRef.current) {
            setPreviewLoading(false);
          }
        });
    }
  }

  function handleSave() {
    setError(null);

    const trimmedPay = String(targetPay).trim();
    let normalizedTargetPay = null;
    if (trimmedPay !== '') {
      const parsed = Number(trimmedPay);
      if (Number.isNaN(parsed)) {
        setError('Target pay must be a number.');
        return;
      }
      normalizedTargetPay = parsed;
    }

    const trimmedStops = String(stops).trim();
    let normalizedStops = null;
    if (trimmedStops !== '') {
      const parsed = Number(trimmedStops);
      if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
        setError('Stops must be a whole number.');
        return;
      }
      normalizedStops = parsed;
    }

    const payload = {
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, blankToNull(fields[field])])),
      stops: normalizedStops,
      target_pay: normalizedTargetPay,
      early_pu: datetimeLocalToMysql(earlyPu),
      late_pu: datetimeLocalToMysql(latePu),
      late_del: datetimeLocalToMysql(lateDel),
      extra_stops: extraStops
        .filter((s) => s.city.trim() !== '' || s.state.trim() !== '')
        .map((s) => ({ type: s.type, city: blankToNull(s.city), state: blankToNull(s.state), datetime: datetimeLocalToMysql(s.datetime) })),
      status,
      custom_reply_body: useCustomReply ? blankToNull(customReplyText) : null,
    };

    setSaving(true);
    updateLoad(load.id, payload)
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      {...preset.modal.backdrop}
    >
      <MotionCard className="max-h-[85vh] w-full max-w-lg overflow-y-auto" {...preset.modal.card}>
        <h2 id="rate-modal-title" className="mb-4 text-lg font-semibold text-text">
          Edit load {load.load_number}
        </h2>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_city">
              Origin city
            </label>
            <input
              id="origin_city"
              value={fields.origin_city}
              onChange={(e) => handleFieldChange('origin_city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <input
              id="origin_state"
              value={fields.origin_state}
              onChange={(e) => handleFieldChange('origin_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_zip">
              Zip
            </label>
            <input
              id="origin_zip"
              value={fields.origin_zip}
              onChange={(e) => handleFieldChange('origin_zip', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_city">
              Dest city
            </label>
            <input
              id="dest_city"
              value={fields.dest_city}
              onChange={(e) => handleFieldChange('dest_city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <input
              id="dest_state"
              value={fields.dest_state}
              onChange={(e) => handleFieldChange('dest_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_zip">
              Zip
            </label>
            <input
              id="dest_zip"
              value={fields.dest_zip}
              onChange={(e) => handleFieldChange('dest_zip', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="earlyPu">
              Early pickup
            </label>
            <input
              id="earlyPu"
              type="datetime-local"
              value={earlyPu}
              onChange={(e) => setEarlyPu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="latePu">
              Late pickup
            </label>
            <input
              id="latePu"
              type="datetime-local"
              value={latePu}
              onChange={(e) => setLatePu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="lateDel">
              Late delivery
            </label>
            <input
              id="lateDel"
              type="datetime-local"
              value={lateDel}
              onChange={(e) => setLateDel(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="equipment">
              Equipment
            </label>
            <input
              id="equipment"
              value={fields.equipment}
              onChange={(e) => handleFieldChange('equipment', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="weight">
              Weight
            </label>
            <input
              id="weight"
              value={fields.weight}
              onChange={(e) => handleFieldChange('weight', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="commodity">
              Commodity
            </label>
            <input
              id="commodity"
              value={fields.commodity}
              onChange={(e) => handleFieldChange('commodity', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="temperature">
              Temperature
            </label>
            <input
              id="temperature"
              value={fields.temperature}
              onChange={(e) => handleFieldChange('temperature', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="stops">
              Stops
            </label>
            <input
              id="stops"
              value={stops}
              onChange={(e) => setStops(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="comment">
          Comment
        </label>
        <textarea
          id="comment"
          value={fields.comment}
          onChange={(e) => handleFieldChange('comment', e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
        />

        <ExtraStopsEditor stops={extraStops} onChange={setExtraStops} />

        <div className="mb-4">
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="useCustomReply">
            <input
              id="useCustomReply"
              type="checkbox"
              checked={useCustomReply}
              onChange={(e) => handleToggleCustomReply(e.target.checked)}
            />
            Use a custom reply for this load
          </label>
          {useCustomReply && (
            <>
              {previewLoading && <p className="mb-1 text-xs text-text-muted">Loading suggested text...</p>}
              <textarea
                id="customReplyText"
                aria-label="Custom reply text"
                value={customReplyText}
                onChange={(e) => setCustomReplyText(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 font-mono text-sm text-text"
              />
              <p className="mt-1 text-xs text-text-muted">
                Sent as-is instead of the auto-generated PU/DEL/Weight/Rate reply — useful for multi-pick/multi-drop
                loads that need extra stop info added.
              </p>
            </>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="targetPay">
              Target pay
            </label>
            <input
              id="targetPay"
              type="number"
              step="0.01"
              value={targetPay}
              onChange={(e) => setTargetPay(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text"
            >
              <option value="active">Active</option>
              <option value="booked">Booked</option>
              <option value="covered">Covered</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

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
