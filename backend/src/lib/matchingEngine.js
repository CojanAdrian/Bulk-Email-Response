const STATE_NAMES = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
  co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
  hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
  mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
  nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio',
  ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
  va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
};

function normalizeText(s) {
  return String(s || '').toLowerCase();
}

// State abbreviations are matched case-sensitively against the ORIGINAL text (not
// lowercased) because many abbreviations collide with common English words when
// lowercased -- "hi" (Hawaii), "in" (Indiana), "or" (Oregon), "me" (Maine), "ok"
// (Oklahoma), "pa" (Pennsylvania), "la" (Louisiana), "ma" (Massachusetts), "co"
// (Colorado). A carrier writing "Hi, do you have anything?" or "this or that" should
// not spuriously match a Hawaii/Oregon load. People do write state abbreviations in
// caps ("TX", "GA") when referring to a state, so requiring uppercase is a reliable
// signal. Full state names ("Texas", "Georgia") don't collide with common words, so
// those stay case-insensitive.
function textMentionsState(originalText, stateAbbr) {
  if (!stateAbbr) return false;
  const abbrUpper = String(stateAbbr).toUpperCase();
  if (new RegExp(`\\b${abbrUpper}\\b`).test(originalText)) return true;
  const fullName = STATE_NAMES[abbrUpper.toLowerCase()];
  return fullName ? normalizeText(originalText).includes(fullName) : false;
}

function findLoadNumberMatch(text, loads) {
  const normalized = normalizeText(text);
  return loads.find((load) => load.load_number && normalized.includes(String(load.load_number).toLowerCase()));
}

// Requires BOTH ends of the route to be confirmed in the text -- an inquiry
// that names one specific origin and one specific destination must match a
// load on both, not just one. A destination-only match against a load whose
// origin is nowhere close to (or outright contradicted by) the text mentioned
// is not the same load, even if the two happen to share a city/state on one
// end -- see the matchingEngine tests for the real example that motivated this.
function findCityStateMatches(text, loads) {
  const normalized = normalizeText(text);
  return loads.filter((load) => {
    const originMatch = load.origin_city && load.origin_state &&
      normalized.includes(String(load.origin_city).toLowerCase()) &&
      textMentionsState(text, load.origin_state);
    const destMatch = load.dest_city && load.dest_state &&
      normalized.includes(String(load.dest_city).toLowerCase()) &&
      textMentionsState(text, load.dest_state);
    return originMatch && destMatch;
  });
}

function findCityMatches(text, loads) {
  const normalized = normalizeText(text);
  return loads.filter((load) =>
    (load.origin_city && normalized.includes(String(load.origin_city).toLowerCase())) ||
    (load.dest_city && normalized.includes(String(load.dest_city).toLowerCase()))
  );
}

function findStateMatches(text, loads) {
  return loads.filter((load) =>
    textMentionsState(text, load.origin_state) || textMentionsState(text, load.dest_state)
  );
}

function extractDate(text) {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3], 10) : parseInt(match[3], 10)) : null;
  return { month, day, year };
}

function matchesExtractedDate(loadDate, extracted) {
  const d = new Date(loadDate);
  if (extracted.year !== null && d.getFullYear() !== extracted.year) return false;
  return d.getMonth() + 1 === extracted.month && d.getDate() === extracted.day;
}

function resolveTie(candidates, text) {
  const extracted = extractDate(text);
  let pool = candidates;
  if (extracted) {
    const dateFiltered = candidates.filter((load) => load.early_pu && matchesExtractedDate(load.early_pu, extracted));
    if (dateFiltered.length >= 1) {
      pool = dateFiltered;
    }
  }
  if (pool.length === 1) return pool[0];
  const withPickup = pool.filter((load) => load.early_pu);
  if (withPickup.length === 0) return pool[0];
  return withPickup.reduce((earliest, load) => (new Date(load.early_pu) < new Date(earliest.early_pu) ? load : earliest));
}

function matchInquiry(emailText, loads) {
  if (!loads || loads.length === 0) {
    return { matchedLoad: null, tier: 'none' };
  }

  const loadNumberMatch = findLoadNumberMatch(emailText, loads);
  if (loadNumberMatch) {
    return { matchedLoad: loadNumberMatch, tier: 'load_number' };
  }

  const cityStateMatches = findCityStateMatches(emailText, loads);
  if (cityStateMatches.length > 0) {
    return { matchedLoad: resolveTie(cityStateMatches, emailText), tier: 'city_state' };
  }

  const cityMatches = findCityMatches(emailText, loads);
  if (cityMatches.length > 0) {
    return { matchedLoad: resolveTie(cityMatches, emailText), tier: 'city' };
  }

  const stateMatches = findStateMatches(emailText, loads);
  if (stateMatches.length > 0) {
    return { matchedLoad: resolveTie(stateMatches, emailText), tier: 'state' };
  }

  return { matchedLoad: null, tier: 'none' };
}

module.exports = {
  matchInquiry,
  extractDate,
  findLoadNumberMatch,
  findCityStateMatches,
  findCityMatches,
  findStateMatches,
  resolveTie,
};
