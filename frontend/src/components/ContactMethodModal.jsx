import { useState } from 'react';

function ContactMethodModal({ onCancel, onConfirm }) {
  const [contactMethod, setContactMethod] = useState('phone');
  const [includeContactLine, setIncludeContactLine] = useState(false);
  const [commentContact, setCommentContact] = useState('');
  const [rateChoice, setRateChoice] = useState('none');

  function handleConfirm() {
    onConfirm({
      contactMethod,
      commentContact: includeContactLine ? commentContact.trim() : '',
      rateChoice,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
      className="fixed inset-0 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 id="contact-modal-title" className="mb-4 text-lg font-semibold text-slate-100">
          DAT Contact Method
        </h2>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-slate-400">Contact method</legend>
          <label className="mb-1 flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" name="contactMethod" value="phone" checked={contactMethod === 'phone'} onChange={() => setContactMethod('phone')} />
            Phone
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" name="contactMethod" value="email" checked={contactMethod === 'email'} onChange={() => setContactMethod('email')} />
            Email
          </label>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-slate-400">Append a contact line to the comment?</legend>
          <label className="mb-1 flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={includeContactLine} onChange={(e) => setIncludeContactLine(e.target.checked)} />
            Include a contact line
          </label>
          {includeContactLine && (
            <input
              type="text"
              value={commentContact}
              onChange={(e) => setCommentContact(e.target.value)}
              placeholder="e.g. Call John 555-1234"
              aria-label="Contact line text"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          )}
        </fieldset>

        <fieldset className="mb-6">
          <legend className="mb-2 text-sm text-slate-400">DAT Loadboard Rate</legend>
          <label className="mb-1 flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" name="rateChoice" value="all" checked={rateChoice === 'all'} onChange={() => setRateChoice('all')} />
            Include for all loads
          </label>
          <label className="mb-1 flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" name="rateChoice" value="some" checked={rateChoice === 'some'} onChange={() => setRateChoice('some')} />
            Choose per load
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" name="rateChoice" value="none" checked={rateChoice === 'none'} onChange={() => setRateChoice('none')} />
            Don&apos;t include rate
          </label>
        </fieldset>

        <p className="mb-4 text-xs text-slate-500">Controls whether the Target Pay value is included as the DAT Loadboard Rate.</p>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
            Cancel
          </button>
          <button onClick={handleConfirm} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContactMethodModal;
