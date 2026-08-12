import { useState } from 'react';
import { motion } from 'framer-motion';
import { createLoad } from '../api/loads';
import { datetimeLocalToMysql } from '../lib/dateInput';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import ExtraStopsEditor from './ExtraStopsEditor';

const MotionCard = motion(Card);

const TEXT_FIELDS = [
  'load_number', 'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip',
  'equipment', 'weight', 'commodity', 'temperature', 'comment',
];

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function AddLoadModal({ onClose, onCreated }) {
  const preset = useMotionPreset();
  const [fields, setFields] = useState(() => Object.fromEntries(TEXT_FIELDS.map((f) => [f, ''])));
  const [stops, setStops] = useState('');
  const [targetPay, setTargetPay] = useState('');
  const [earlyPu, setEarlyPu] = useState('');
  const [latePu, setLatePu] = useState('');
  const [lateDel, setLateDel] = useState('');
  const [includeRate, setIncludeRate] = useState(true);
  const [extraStops, setExtraStops] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleFieldChange(field, value) {
    setFields((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    setError(null);

    const loadNumber = fields.load_number.trim();
    if (loadNumber === '') {
      setError('Load # is required.');
      return;
    }

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
      load_number: loadNumber,
      ...Object.fromEntries(TEXT_FIELDS.filter((f) => f !== 'load_number').map((field) => [field, blankToNull(fields[field])])),
      stops: normalizedStops,
      target_pay: normalizedTargetPay,
      early_pu: datetimeLocalToMysql(earlyPu),
      late_pu: datetimeLocalToMysql(latePu),
      late_del: datetimeLocalToMysql(lateDel),
      include_rate: includeRate,
      extra_stops: extraStops
        .filter((s) => s.city.trim() !== '' || s.state.trim() !== '')
        .map((s) => ({ type: s.type, city: blankToNull(s.city), state: blankToNull(s.state), datetime: datetimeLocalToMysql(s.datetime) })),
    };

    setSaving(true);
    createLoad(payload)
      .then((created) => {
        onCreated(created);
        onClose();
      })
      .catch((err) => {
        setError(err.message || 'Failed to create the load.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-load-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      {...preset.modal.backdrop}
    >
      <MotionCard className="max-h-[85vh] w-full max-w-lg overflow-y-auto" {...preset.modal.card}>
        <h2 id="add-load-title" className="mb-4 text-lg font-semibold text-text">
          Add a load
        </h2>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="load_number">
            Load #
          </label>
          <input
            id="load_number"
            value={fields.load_number}
            onChange={(e) => handleFieldChange('load_number', e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_city">
              Origin city
            </label>
            <input id="origin_city" value={fields.origin_city} onChange={(e) => handleFieldChange('origin_city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <input id="origin_state" value={fields.origin_state} onChange={(e) => handleFieldChange('origin_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_zip">
              Zip
            </label>
            <input id="origin_zip" value={fields.origin_zip} onChange={(e) => handleFieldChange('origin_zip', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_city">
              Dest city
            </label>
            <input id="dest_city" value={fields.dest_city} onChange={(e) => handleFieldChange('dest_city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <input id="dest_state" value={fields.dest_state} onChange={(e) => handleFieldChange('dest_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_zip">
              Zip
            </label>
            <input id="dest_zip" value={fields.dest_zip} onChange={(e) => handleFieldChange('dest_zip', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="earlyPu">
              Early pickup
            </label>
            <input id="earlyPu" type="datetime-local" value={earlyPu} onChange={(e) => setEarlyPu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="latePu">
              Late pickup
            </label>
            <input id="latePu" type="datetime-local" value={latePu} onChange={(e) => setLatePu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="lateDel">
              Late delivery
            </label>
            <input id="lateDel" type="datetime-local" value={lateDel} onChange={(e) => setLateDel(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="equipment">
              Equipment
            </label>
            <input id="equipment" value={fields.equipment} onChange={(e) => handleFieldChange('equipment', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="weight">
              Weight
            </label>
            <input id="weight" value={fields.weight} onChange={(e) => handleFieldChange('weight', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="commodity">
              Commodity
            </label>
            <input id="commodity" value={fields.commodity} onChange={(e) => handleFieldChange('commodity', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="temperature">
              Temperature
            </label>
            <input id="temperature" value={fields.temperature} onChange={(e) => handleFieldChange('temperature', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="stops">
              Stops
            </label>
            <input id="stops" value={stops} onChange={(e) => setStops(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="comment">
          Comment
        </label>
        <textarea id="comment" value={fields.comment} onChange={(e) => handleFieldChange('comment', e.target.value)} rows={2}
          className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />

        <ExtraStopsEditor stops={extraStops} onChange={setExtraStops} />

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="targetPay">
              Target pay
            </label>
            <input id="targetPay" type="number" step="0.01" value={targetPay} onChange={(e) => setTargetPay(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-text" htmlFor="includeRate">
              <input id="includeRate" type="checkbox" checked={includeRate} onChange={(e) => setIncludeRate(e.target.checked)} />
              Include rate in replies
            </label>
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
            {saving ? 'Adding...' : 'Add load'}
          </PrimaryButton>
        </div>
      </MotionCard>
    </motion.div>
  );
}

export default AddLoadModal;
