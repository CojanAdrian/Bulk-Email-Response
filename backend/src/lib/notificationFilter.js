// Best-effort denylist for automated/system emails that are NOT a carrier
// asking about a load -- tracking notifications, load-lock alerts, shipment-
// tendered confirmations, etc. This can never be a complete classifier (new
// automated senders/phrasing will show up over time); extend the patterns
// below as new cases are found rather than trying to enumerate every one
// up front.

// Matches senders whose LOCAL PART (before the @) is itself a generic
// automated-mail name, e.g. noreply@truckertools.com, Loadlock@igtfreight.com.
const AUTOMATED_SENDER_PATTERN = /^(no-?reply|do-?not-?reply|notifications?|alerts?|tracking|loadlock|automated|system)@/i;

// Matches subject-line phrasing characteristic of an automated status
// update rather than a carrier's own question about availability.
const NOTIFICATION_SUBJECT_PATTERNS = [
  /real-time location/i,
  /load\s*lock\s*alert/i,
  /\btendered\b/i,
  /\bload\s*track\b/i,
];

function extractBareAddress(fromHeader) {
  const match = String(fromHeader || '').match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader || '').trim().toLowerCase();
}

function looksLikeAutomatedNotification(message) {
  const fromAddress = extractBareAddress(message.from);
  if (AUTOMATED_SENDER_PATTERN.test(fromAddress)) return true;

  const subject = message.subject || '';
  return NOTIFICATION_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

module.exports = { looksLikeAutomatedNotification };
