// Each user's own preferences, stored as one JSON document per user. Only
// the keys below exist; anything else sent in is ignored, and each value is
// checked against its kind.

const DEFAULTS = {
  targets: { loadsPerDay: 8, marginPerLoad: 1500, replyMinutes: 10, weeklyGp: 30000 },
  profile: { displayName: '' },
  board: { openingTab: 'loads', sort: 'newest' },
  notifications: { newInquiry: true, waitingTooLong: true, sound: false },
  appearance: { map: true, motion: 'full' },
};

const TABS = ['loads', 'inquiries', 'carriers', 'customers', 'stats'];
const SORTS = ['newest', 'pu', 'target_pay', 'origin', 'destination', 'load_number', 'equipment'];

function number(min, max) {
  return (value) => {
    const n = Number(value);
    if (value === null || value === '' || !Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
}
function oneOf(options) {
  return (value) => (options.includes(value) ? value : undefined);
}
function bool(value) {
  return typeof value === 'boolean' ? value : undefined;
}
function text(maxLength) {
  return (value) => (typeof value === 'string' ? value.trim().slice(0, maxLength) : undefined);
}

const RULES = {
  targets: { loadsPerDay: number(1, 500), marginPerLoad: number(0, 100000), replyMinutes: number(1, 1440), weeklyGp: number(0, 10000000) },
  profile: { displayName: text(80) },
  board: { openingTab: oneOf(TABS), sort: oneOf(SORTS) },
  notifications: { newInquiry: bool, waitingTooLong: bool, sound: bool },
  appearance: { map: bool, motion: oneOf(['full', 'reduced']) },
};

// Stored settings laid over the defaults, so a setting added later shows
// up for everyone with its default value.
function withDefaults(stored) {
  const merged = {};
  for (const [section, values] of Object.entries(DEFAULTS)) {
    merged[section] = { ...values, ...((stored && stored[section]) || {}) };
  }
  return merged;
}

// The valid part of a change, e.g. { targets: { loadsPerDay: 9 } }.
function cleanChange(change) {
  const clean = {};
  for (const [section, rules] of Object.entries(RULES)) {
    const incoming = change && change[section];
    if (!incoming || typeof incoming !== 'object') continue;
    for (const [key, rule] of Object.entries(rules)) {
      if (!(key in incoming)) continue;
      const value = rule(incoming[key]);
      if (value === undefined) continue;
      clean[section] = { ...(clean[section] || {}), [key]: value };
    }
  }
  return clean;
}

function applyChange(current, change) {
  const next = withDefaults(current);
  for (const [section, values] of Object.entries(cleanChange(change))) {
    next[section] = { ...next[section], ...values };
  }
  return next;
}

module.exports = { DEFAULTS, withDefaults, cleanChange, applyChange };
