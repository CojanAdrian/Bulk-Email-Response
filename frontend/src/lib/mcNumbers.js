// MC numbers in a carrier email. Same rules as the server (backend/src/lib/mcNumbers.js)
// and the MC Check extension, used for inquiries saved before the server
// started finding MC#s itself.

// MC# 123456, MC#123456, MC 123456, MC-123456, MC123456, M.C. #123456,
// MC Number: 123456, MC No. 123456, MC #: 123456, MC: 123456
export const MC_RE = /\bM\.?\s?C\.?\s*(?:#|No\.?|Num(?:ber)?\.?)?\s*[:#\-]?\s*#?\s*(\d{3,8})(?!\d)/gi;

export function normalizeMc(mc) {
  const digits = String(mc).replace(/\D/g, '').replace(/^0+/, '');
  return digits || null;
}

export function findAllMcs(text) {
  const out = [];
  if (!text) return out;
  MC_RE.lastIndex = 0;
  let match;
  while ((match = MC_RE.exec(text))) {
    const mc = normalizeMc(match[1]);
    if (mc && !out.includes(mc)) out.push(mc);
  }
  return out;
}

// The part of an email written in this message: quoted replies and
// forwarded history cut off.
export function stripQuoted(text) {
  if (!text) return '';
  const body = String(text).replace(/\r\n?/g, '\n');
  const cutters = [
    /(^|\n)[ \t]*On [^\n]{0,250}?(\n[^\n]{0,120}?)?wrote:[ \t]*(\n|$)/i,
    /(^|\n)[ \t]*-{2,}\s*Original Message\s*-{2,}/i,
    /(^|\n)[ \t]*_{8,}[ \t]*\n[ \t]*From:/i,
    /(^|\n)[ \t]*From:[^\n]*\n(?:[^\n]*\n){0,3}?[ \t]*(?:Sent|Date):/i,
    /(^|\n)[ \t]*-{2,}\s*Forwarded message\s*-{2,}/i,
  ];
  let cut = body.length;
  for (const re of cutters) {
    const match = re.exec(body);
    if (match && match.index < cut) cut = match.index;
  }
  return body
    .slice(0, cut)
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

const MAX_CANDIDATES = 5;

// Every MC# in the email, best first: the subject, then what the carrier
// wrote in this message, then quoted history. The extension skips any on
// your ignore list (your own MC#) and checks the first one left.
export function candidateMcs(subject, body) {
  const ordered = [...findAllMcs(subject), ...findAllMcs(stripQuoted(body)), ...findAllMcs(body)];
  return [...new Set(ordered)].slice(0, MAX_CANDIDATES);
}

