// The inline "leave without saving?" prompt shown in place of a modal's
// normal footer buttons once useCloseConfirmation reports it's confirming
// -- an inline swap (matching the app's existing inline confirm/cancel
// pattern for row deletes in LoadsTable) rather than a native confirm(),
// which can't be styled and blocks the whole page.
function UnsavedChangesBar({ onDiscard, onKeepEditing }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-error">Discard changes?</span>
      <button
        type="button"
        onClick={onDiscard}
        className="rounded-full bg-error px-3.5 py-1.5 text-xs font-semibold text-black hover:opacity-90"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onKeepEditing}
        className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold hover:bg-white/[0.16]"
      >
        Keep editing
      </button>
    </div>
  );
}

export default UnsavedChangesBar;
