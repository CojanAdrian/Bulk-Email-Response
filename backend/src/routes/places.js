const express = require('express');
const { searchCities } = require('../lib/cityCoords');

const MAX_RESULTS = 10;

// City suggestions for the city fields, from the bundled list of US and
// Canadian places. Works without any Google key.
function createPlacesRouter() {
  const router = express.Router();
  router.get('/cities', (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json([]);
    const limit = Math.min(MAX_RESULTS, Math.max(1, Number(req.query.limit) || 8));
    res.json(searchCities(query, limit));
  });
  return router;
}

module.exports = createPlacesRouter;
