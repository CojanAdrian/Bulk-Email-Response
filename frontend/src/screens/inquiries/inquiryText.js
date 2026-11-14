// Small helpers for showing an inquiry.

export function senderName(fromAddress) {
  const text = String(fromAddress || '');
  const named = text.match(/^\s*"?([^"<]+?)"?\s*</);
  return (named ? named[1] : text).trim() || 'Unknown sender';
}

export function senderEmail(fromAddress) {
  const text = String(fromAddress || '');
  const angle = text.match(/<([^>]+)>/);
  return (angle ? angle[1] : text).trim();
}

export const TIER_LABELS = {
  load_number: 'Load number',
  city_state: 'City and state',
  city: 'City only',
  state: 'State only',
  manual: 'Matched by you',
  none: 'No match',
};

export const STATUS_LABELS = {
  none: 'No match',
  pending_review: 'Waiting',
  auto_sent: 'Auto-sent',
  sent: 'Sent',
  rejected: 'Rejected',
};

// The reply to show in the editor: recomposed from the load as it is now,
// falling back to the snapshot taken when the email arrived.
export function draftFor(inquiry) {
  return inquiry.live_reply_body ?? inquiry.reply_body ?? '';
}

export function matchesSearch(inquiry, query) {
  if (!query) return true;
  const haystack = [inquiry.from_address, inquiry.subject, inquiry.body_snippet, inquiry.matched_load_load_number, inquiry.matched_load_origin_city, inquiry.matched_load_dest_city]
    .map((part) => part ?? '')
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

// Adds or removes the "Rate: $…" line in a reply.
export function withRateLine(draft, include, targetPay) {
  const rateLine = `Rate: $${Number(targetPay).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const withoutRate = String(draft || '')
    .split('\n')
    .filter((line) => !line.startsWith('Rate: '))
    .join('\n');
  if (!include) return withoutRate;
  return withoutRate ? `${withoutRate}\n${rateLine}` : rateLine;
}
