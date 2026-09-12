import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getCarrierMatchesForLoad, searchCarrierMatches } from '../api/carrierMatches';
import { listCarrierHistory } from '../api/carriers';
import CarrierLaneMap from '../components/CarrierLaneMap';
import CarrierDetailSheet from '../components/CarrierDetailSheet';
import CarrierSheet from '../components/CarrierSheet';
import CityStateAutocomplete from '../components/CityStateAutocomplete';
import PrimaryButton from '../components/PrimaryButton';
import Badge from '../components/Badge';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';

const TIER_BADGE_VARIANT = { perfect: 'success', strong: 'info', weak: 'warning', regional_perfect: 'success', regional: 'default' };
const TIER_LABEL = { perfect: 'Perfect match', strong: 'Strong match', weak: 'Weak match (deadhead)', regional_perfect: 'Regional (both ends)', regional: 'Regional' };
const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT_OPTIONS.map((o) => [o.code, o.label]));

function blankLane() {
  return { originCity: '', originState: '', destCity: '', destState: '', equipment: '' };
}

function laneFromLoad(load) {
  if (!load) return blankLane();
  return {
    originCity: load.origin_city || '', originState: load.origin_state || '',
    destCity: load.dest_city || '', destState: load.dest_state || '',
    equipment: load.equipment || '',
  };
}

// Matches can succeed (they only need the origin resolved) while the lane
// itself still can't be drawn/zoomed to on the map (origin resolved, dest
// didn't, or vice versa) -- surfaces which one so "no route showed up"
// has a visible reason instead of failing silently.
function noteForQueryLane(data) {
  if (data.queryOrigin && data.queryDest) return null;
  if (!data.queryOrigin) return "Couldn't locate the origin on the map (matches, if any, are still shown).";
  if (!data.queryDest) return "Couldn't locate the destination on the map (matches are still shown).";
  return null;
}

// A matched-carrier card, big enough to call someone straight off of it --
// name, tier/distance, MC, phone, and equipment all inline instead of a
// bare name behind a click. Clicking it swaps this list out for the
// read-only detail panel (see CarrierMapPage) and draws that carrier's
// lane history as real driving routes on the map.
function MatchCard({ match, onSelect }) {
  const distanceLabel = match.taggedStates
    ? (match.taggedStates || []).join(', ')
    : `${Math.round(match.originDistanceMiles)}mi from origin`;
  return (
    <button
      type="button"
      onClick={() => onSelect(match.carrierId)}
      className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-semibold text-white">{match.carrierName}</span>
        <div className="flex shrink-0 items-center gap-1">
          {match.equipmentMismatch && (
            <Badge variant="warning" title="Doesn't have the equipment type you searched for">
              Equipment?
            </Badge>
          )}
          <Badge variant={TIER_BADGE_VARIANT[match.tier] || 'default'}>{TIER_LABEL[match.tier] || match.tier}</Badge>
        </div>
      </div>
      <p className="mb-1.5 text-xs text-white/50">{distanceLabel}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/70">
        {match.mc_number && <span>MC {match.mc_number}</span>}
        {match.dispatcher_phone && (
          <>
            <span className="text-white/30">•</span>
            <span>{match.dispatcher_phone}</span>
          </>
        )}
      </div>
      {Array.isArray(match.equipment_types) && match.equipment_types.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {match.equipment_types.map((code) => (
            <span key={code} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              {EQUIPMENT_LABEL[code] || code}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// The Carriers tab's map-first view: a full-bleed real Google Map (no
// boxed-in card -- it fills the whole panel edge to edge) with a manual
// lane search tucked into the bottom-left corner and the ranked match list
// docked to the right. Works both deep-linked from a load's "view matches"
// (focusedLoad pre-fills and auto-searches the lane, but stays editable)
// and standalone (search any lane with nothing uploaded). Clicking a match
// swaps the right-hand list for a read-only detail panel (CarrierDetailSheet,
// docked variant) in the same footprint -- no full-screen popup blocking
// the map -- and draws that carrier's lane history as real driving routes;
// the panel's own Edit button opens CarrierSheet.
function CarrierMapPage({ focusedLoad }) {
  const [lane, setLane] = useState(() => laneFromLoad(focusedLoad));
  const [laneMatches, setLaneMatches] = useState([]);
  const [regionalMatches, setRegionalMatches] = useState([]);
  const [queryLane, setQueryLane] = useState(null); // { originLat, originLng, destLat, destLng } for the map
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [mapNote, setMapNote] = useState(null);
  const [selectedCarrierId, setSelectedCarrierId] = useState(null);
  const [selectedCarrierHistory, setSelectedCarrierHistory] = useState([]);
  const [editingCarrier, setEditingCarrier] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusedLoad) return;
    setLane(laneFromLoad(focusedLoad));
    setStatus('loading');
    setError(null);
    getCarrierMatchesForLoad(focusedLoad.id)
      .then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          // The load's own origin_lat/dest_lat columns are never populated
          // (matching always geocodes live from city/state instead) -- use
          // the freshly-geocoded coordinates this response already carries
          // rather than reading always-null fields off the load itself.
          if (data.queryOrigin && data.queryDest) {
            setQueryLane({
              originLat: data.queryOrigin.lat, originLng: data.queryOrigin.lng,
              destLat: data.queryDest.lat, destLng: data.queryDest.lng,
            });
          } else {
            setQueryLane(null);
          }
          setMapNote(noteForQueryLane(data));
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
    setMapNote(null);
    if (!lane.originCity.trim() || !lane.originState.trim() || !lane.destCity.trim() || !lane.destState.trim()) {
      setError('Origin and destination city/state are required.');
      return;
    }
    setStatus('loading');
    searchCarrierMatches({
      originCity: lane.originCity.trim(), originState: lane.originState.trim(),
      destCity: lane.destCity.trim(), destState: lane.destState.trim(),
      equipment: lane.equipment || null,
    })
      .then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          if (data.queryOrigin && data.queryDest) {
            setQueryLane({
              originLat: data.queryOrigin.lat, originLng: data.queryOrigin.lng,
              destLat: data.queryDest.lat, destLng: data.queryDest.lng,
            });
          } else {
            setQueryLane(null);
          }
          setMapNote(noteForQueryLane(data));
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
    setSelectedCarrierId(carrierId);
    listCarrierHistory(carrierId)
      .then((history) => {
        if (isMountedRef.current) setSelectedCarrierHistory(history);
      })
      .catch(() => {
        if (isMountedRef.current) setSelectedCarrierHistory([]);
      });
  }

  function closeDetail() {
    setSelectedCarrierId(null);
    setSelectedCarrierHistory([]);
  }

  function reRunSearch() {
    if (focusedLoad) {
      getCarrierMatchesForLoad(focusedLoad.id).then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          if (data.queryOrigin && data.queryDest) {
            setQueryLane({
              originLat: data.queryOrigin.lat, originLng: data.queryOrigin.lng,
              destLat: data.queryDest.lat, destLng: data.queryDest.lng,
            });
          }
        }
      });
    } else if (lane.originCity.trim() && lane.originState.trim() && lane.destCity.trim() && lane.destState.trim()) {
      handleSearch();
    }
  }

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden bg-[#05060a]">
      <div className="absolute inset-0">
        <CarrierLaneMap
          focusedLoad={queryLane}
          laneMatches={laneMatches}
          regionalMatches={regionalMatches}
          onSelectCarrier={handleSelectCarrier}
          selectedCarrierId={selectedCarrierId}
          selectedCarrierHistory={selectedCarrierHistory}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-start p-4 sm:p-6">
        <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/50 p-3 backdrop-blur-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Search a lane</p>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CityStateAutocomplete
              id="lane-origin-city"
              ariaLabel="Origin city"
              placeholder="Origin city"
              value={lane.originCity}
              onChange={(e) => setLane((prev) => ({ ...prev, originCity: e.target.value }))}
              onPlaceSelected={({ city, state }) => setLane((prev) => ({ ...prev, originCity: city, originState: state }))}
              className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
            />
            <input
              aria-label="Origin state"
              placeholder="Origin state"
              value={lane.originState}
              onChange={(e) => setLane((prev) => ({ ...prev, originState: e.target.value }))}
              className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
            />
            <CityStateAutocomplete
              id="lane-dest-city"
              ariaLabel="Destination city"
              placeholder="Destination city"
              value={lane.destCity}
              onChange={(e) => setLane((prev) => ({ ...prev, destCity: e.target.value }))}
              onPlaceSelected={({ city, state }) => setLane((prev) => ({ ...prev, destCity: city, destState: state }))}
              className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
            />
            <input
              aria-label="Destination state"
              placeholder="Destination state"
              value={lane.destState}
              onChange={(e) => setLane((prev) => ({ ...prev, destState: e.target.value }))}
              className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
            />
          </div>
          <div className="mb-2">
            <select
              aria-label="Equipment"
              value={lane.equipment}
              onChange={(e) => setLane((prev) => ({ ...prev, equipment: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white [&>option]:bg-[#05060a]"
            >
              <option value="">Any equipment</option>
              {EQUIPMENT_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} — {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            {focusedLoad && <span className="text-xs text-white/40">Load {focusedLoad.load_number}</span>}
            <PrimaryButton onClick={handleSearch} disabled={status === 'loading'} className="ml-auto px-4 py-1.5 text-xs">
              {status === 'loading' ? 'Searching...' : 'Search'}
            </PrimaryButton>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-error">
              {error}
            </p>
          )}
          {mapNote && (
            <p role="status" className="mt-2 text-xs text-warning">
              {mapNote}
            </p>
          )}
        </div>
      </div>

      <div className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col overflow-hidden border-l border-white/10 bg-black/40 backdrop-blur-xl">
        <h2 className="shrink-0 border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">Matched carriers</h2>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {laneMatches.length === 0 && regionalMatches.length === 0 && (
            <p className="text-sm text-white/50">{status === 'loading' ? 'Searching...' : 'No matches yet.'}</p>
          )}
          {laneMatches.length > 0 && (
            <ul className="mb-4 space-y-2">
              {laneMatches.map((match) => (
                <li key={match.carrierId}>
                  <MatchCard match={match} onSelect={handleSelectCarrier} />
                </li>
              ))}
            </ul>
          )}
          {regionalMatches.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">No booked lanes — tagged region</p>
              <ul className="space-y-2">
                {regionalMatches.map((match) => (
                  <li key={match.carrierId}>
                    <MatchCard match={match} onSelect={handleSelectCarrier} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Slides in over the match list, in the same right-edge footprint,
          instead of the old centered popup -- the globe (and the list
          underneath) stays visible and interactive on the left. */}
      <AnimatePresence>
        {selectedCarrierId && !editingCarrier && (
          <CarrierDetailSheet
            carrierId={selectedCarrierId}
            onClose={closeDetail}
            onEdit={(carrier) => setEditingCarrier(carrier)}
            variant="docked"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingCarrier && (
          <CarrierSheet
            carrier={editingCarrier}
            onClose={() => setEditingCarrier(null)}
            onSaved={() => {
              setEditingCarrier(null);
              reRunSearch();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default CarrierMapPage;
