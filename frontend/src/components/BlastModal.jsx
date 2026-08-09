import { useState } from 'react';
import { motion } from 'framer-motion';
import { buildLookupMessage } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import SecondaryButton from './SecondaryButton';

const MotionCard = motion(Card);

function parseBlastEmails(raw) {
  return raw
    .split(/[\n,]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function extractEmailsFromText(text) {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const seen = new Set();
  const out = [];
  matches.forEach((m) => {
    const l = m.toLowerCase();
    if (!seen.has(l)) {
      seen.add(l);
      out.push(m);
    }
  });
  return out;
}

function BlastModal({ load, initialShowRate, onClose }) {
  const preset = useMotionPreset();
  const [showRate, setShowRate] = useState(Boolean(initialShowRate));
  const [subject, setSubject] = useState(
    `Load Available | ${load.origin_city} ${load.origin_state} → ${load.dest_city} ${load.dest_state} | ${load.equipment}`
  );
  const [body, setBody] = useState(buildLookupMessage(load, Boolean(initialShowRate)));
  const [emailsText, setEmailsText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [invalidFlash, setInvalidFlash] = useState(false);
  const [fileError, setFileError] = useState(null);

  const validEmails = parseBlastEmails(emailsText);

  function handleRateToggle(e) {
    setShowRate(e.target.checked);
    setBody(buildLookupMessage(load, e.target.checked));
  }

  function handleOpenGmail() {
    if (validEmails.length === 0) {
      setInvalidFlash(true);
      setTimeout(() => setInvalidFlash(false), 1500);
      return;
    }
    const url =
      'https://mail.google.com/mail/?view=cm&bcc=' +
      encodeURIComponent(validEmails.join(',')) +
      '&su=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body);
    window.open(url, '_blank');
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setFileError("Excel files aren't supported yet — export as CSV first and drop that.");
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const emails = extractEmailsFromText(ev.target.result);
      setEmailsText(emails.join('\n'));
    };
    reader.readAsText(file);
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="blast-modal-title"
      className="fixed inset-0 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...preset.modal.backdrop}
    >
      <MotionCard className="w-full max-w-lg" {...preset.modal.card}>
        <div className="mb-1 flex items-start justify-between">
          <h2 id="blast-modal-title" className="text-lg font-semibold text-text">
            Blast Email
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text">
            ✕
          </button>
        </div>
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Order {load.load_number} · {load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state} · {load.equipment}
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="blastSubject">
          Subject
        </label>
        <input
          id="blastSubject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="blastBody">
          Message
        </label>
        <textarea
          id="blastBody"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mb-2 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
        />
        <label className="mb-4 flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={showRate} onChange={handleRateToggle} />
          {showRate ? 'Rate shown' : 'Rate hidden'}
        </label>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="blastEmails">
          Carrier Emails ({validEmails.length} valid) — or drop a CSV / TXT file
        </label>
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className="relative"
        >
          <textarea
            id="blastEmails"
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            rows={4}
            placeholder="Paste carrier emails — one per line or comma-separated"
            className={`w-full rounded-lg border bg-surface-alt px-3 py-2 text-sm text-text ${
              invalidFlash ? 'border-error' : 'border-border'
            }`}
          />
          {dragActive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent-strong bg-accent/10 text-sm font-semibold text-text">
              ↓ Drop file to import emails
            </div>
          )}
        </div>
        {fileError && (
          <p role="alert" className="mt-2 text-sm text-error">
            {fileError}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          {/* Gmail's own brand blue, deliberately not the app's lime accent — matches the original tool's identical choice for this one external-service button. */}
          <button
            onClick={handleOpenGmail}
            className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Open in Gmail →
          </button>
        </div>
      </MotionCard>
    </motion.div>
  );
}

export default BlastModal;
