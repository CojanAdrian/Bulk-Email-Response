import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getCarrierMatchesForLoad, searchCarrierMatches } from '../api/carrierMatches';
import CarrierMapGlobe from '../components/CarrierMapGlobe';
import CarrierSheet from '../components/CarrierSheet';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import Badge from '../components/Badge';

const TIER_BADGE_VARIANT = { perfect: 'success', strong: 'info', weak: 'warning', regional_perfect: 'success', regional: 'default' };
const TIER_LABEL = { perfect: 'Perfect match', strong: 'Strong match', weak: 'Weak match (deadhead)', regional_perfect: 'Regional (both ends)', regional: 'Regional' };

function blankLane() {
  return { originCity: '', originState: '', destCity: '', destState: '' };
}

// The Carrier Map tab: a manual lane-search form (used when there's no
// focused load) or an automatic lookup for a load's own lane (when
// deep-linked here from a load's match badge -- see LoadsTable.jsx), the
// globe visualization, and a ranked side list. Clicking a matched carrier
// opens Phase 2's CarrierSheet for full detail rather than a duplicate
// view.
function CarrierMapPage({ focusedLoad }) {
  const [lane, setLane] = useState(blankLane());
  const [laneMatches, setLaneMatches] = useState([]);
  const [regionalMatches, setRegionalMatches] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusedLoad) return;
    setStatus('loading');
    setError(null);
    getCarrierMatchesForLoad(focusedLoad.id)
      .then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load matches.');
          setStatus('error');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedLoad?.id]);

  function handleSearch() {
    setError(null);
    if (!lane.originCity.trim() || !lane.originState.trim() || !lane.destCity.trim() || !lane.destState.trim()) {
      setError('Origin and destination city/state are required.');
      return;
    }
    setStatus('loading');
    searchCarrierMatches({
      originCity: lane.originCity.trim(), originState: lane.originState.trim(),
      destCity: lane.destCity.trim(), destState: lane.destState.trim(),
    })
      .then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to search for matches.');
          setStatus('error');
        }
      });
  }

  function handleSelectCarrier(carrierId) {
    const match = laneMatches.find((m) => m.carrierId === carrierId) || regionalMatches.find((m) => m.carrierId === carrierId);
    if (match) setSelectedCarrier({ id: carrierId, company_name: match.carrierName });
  }

  const globeFocusedLoad = focusedLoad
    ? { originLat: focusedLoad.origin_lat, originLng: focusedLoad.origin_lng, destLat: focusedLoad.dest_lat, destLng: focusedLoad.dest_lng }
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="flex flex-col gap-4">
        {!focusedLoad && (
          <div className="rounded-2xl border border-border bg-surface-alt/60 p-3 backdrop-blur-xl">
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                aria-label="Origin city"
                placeholder="Origin city"
                value={lane.originCity}
                onChange={(e) => setLane((prev) => ({ ...prev, originCity: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                aria-label="Origin state"
                placeholder="Origin state"
                value={lane.originState}
                onChange={(e) => setLane((prev) => ({ ...prev, originState: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                aria-label="Destination city"
                placeholder="Destination city"
                value={lane.destCity}
                onChange={(e) => setLane((prev) => ({ ...prev, destCity: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                aria-label="Destination state"
                placeholder="Destination state"
                value={lane.destState}
                onChange={(e) => setLane((prev) => ({ ...prev, destState: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
            </div>
            <div className="flex justify-end">
              <PrimaryButton onClick={handleSearch} disabled={status === 'loading'} className="px-4 py-1.5 text-xs">
                {status === 'loading' ? 'Searching...' : 'Search'}
              </PrimaryButton>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="h-[500px] w-full">
          <CarrierMapGlobe
            focusedLoad={globeFocusedLoad}
            laneMatches={laneMatches}
            regionalMatches={regionalMatches}
            onSelectCarrier={handleSelectCarrier}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-text">Matched carriers</h2>
        {laneMatches.length === 0 && regionalMatches.length === 0 && (
          <p className="text-sm text-text-muted">
            {status === 'loading' ? 'Searching...' : 'No matches yet.'}
          </p>
        )}
        {laneMatches.length > 0 && (
          <ul className="mb-4 space-y-2">
            {laneMatches.map((match) => (
              <li key={match.carrierId}>
                <button
                  type="button"
                  onClick={() => handleSelectCarrier(match.carrierId)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-sm hover:bg-border"
                >
                  <span className="font-medium text-text">{match.carrierName}</span>
                  <Badge variant={TIER_BADGE_VARIANT[match.tier] || 'default'}>
                    {TIER_LABEL[match.tier] || match.tier} — {Math.round(match.originDistanceMiles)}mi
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        {regionalMatches.length > 0 && (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">No booked lanes — tagged region</p>
            <ul className="space-y-2">
              {regionalMatches.map((match) => (
                <li key={match.carrierId}>
                  <button
                    type="button"
                    onClick={() => handleSelectCarrier(match.carrierId)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-sm hover:bg-border"
                  >
                    <span className="font-medium text-text">{match.carrierName}</span>
                    <Badge variant={TIER_BADGE_VARIANT[match.tier] || 'default'}>{(match.taggedStates || []).join(', ')}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <AnimatePresence>
        {selectedCarrier && (
          <CarrierSheet carrier={selectedCarrier} onClose={() => setSelectedCarrier(null)} onSaved={() => setSelectedCarrier(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default CarrierMapPage;
