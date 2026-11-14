import { formatRate } from '../../lib/loadText';

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

// The matched load's fields as a plain load, for the stop badge.
export function inquiryLoad(inquiry) {
  return {
    comment: inquiry.matched_load_comment,
    stops: inquiry.matched_load_stops,
    extra_stops: inquiry.matched_load_extra_stops,
  };
}

const place = (city, state) => [city, state].filter(Boolean).join(', ');

// Why this email was matched to this load, in plain words.
export function matchReason(inquiry) {
  if (!inquiry.matched_load_id) return 'We could not tell which load this is about. Pick it below.';
  const origin = place(inquiry.matched_load_origin_city, inquiry.matched_load_origin_state);
  const dest = place(inquiry.matched_load_dest_city, inquiry.matched_load_dest_state);
  switch (inquiry.match_tier) {
    case 'load_number':
      return `They wrote the load number ${inquiry.matched_load_load_number}. A sure match.`;
    case 'city_state':
      return `They named the lane, ${origin} to ${dest}, with city and state.`;
    case 'city':
      return 'They named a city on this lane, without the state. Worth a look.';
    case 'state':
      return 'They named only a state on this lane. This is a guess, so check it.';
    case 'manual':
      return 'You picked this load.';
    default:
      return 'Matched to this load.';
  }
}

// How sure the match is: 'sure', 'likely' or 'check'.
export function matchConfidence(inquiry) {
  if (!inquiry.matched_load_id || inquiry.ref_mismatch) return 'check';
  if (inquiry.match_tier === 'load_number' || inquiry.match_tier === 'manual') return 'sure';
  if (inquiry.match_tier === 'city_state') return 'likely';
  return 'check';
}

// Adds or removes the "Rate: $…" line in a reply, written exactly as the
// server writes it ($2,450 or $1,150.50).
export function withRateLine(draft, include, targetPay) {
  const rate = formatRate(targetPay);
  const withoutRate = String(draft || '')
    .split('\n')
    .filter((line) => !line.startsWith('Rate: '))
    .join('\n');
  if (!include || !rate) return withoutRate;
  return withoutRate ? `${withoutRate}\nRate: ${rate}` : `Rate: ${rate}`;
}

