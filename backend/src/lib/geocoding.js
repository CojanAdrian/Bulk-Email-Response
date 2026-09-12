// Resolves a city/state pair to {lat, lng} via the Google Maps Geocoding
// API, caching every result in the geocode_cache table so the same city is
// never geocoded twice -- a 300-load CSV upload that mostly repeats a
// handful of origin cities costs at most a few dozen live API calls, not
// hundreds. Returns null (never throws) on a failed or ambiguous lookup --
// a bad or unusual city name must degrade to "this lane can't be matched
// yet," never crash a save.
async function geocodeCityState(pool, city, state) {
  const key = `${String(city || '').trim().toLowerCase()}|${String(state || '').trim().toLowerCase()}`;
  if (key === '|') return null;

  const [cached] = await pool.query('SELECT lat, lng FROM geocode_cache WHERE city_state_key = ?', [key]);
  if (cached.length > 0) {
    return { lat: Number(cached[0].lat), lng: Number(cached[0].lng) };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const result = data.results && data.results[0];
    if (!result) return null;
    const { lat, lng } = result.geometry.location;

    await pool.query(
      'INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)',
      [key, lat, lng]
    );
    return { lat, lng };
  } catch (err) {
    console.error(`Failed to geocode "${city}, ${state}":`, err);
    return null;
  }
}

module.exports = { geocodeCityState };
