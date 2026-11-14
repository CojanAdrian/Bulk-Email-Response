import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { listCarriers, deleteCarrier } from '../../api/carriers';
import { getCarrierMatchesForLoad, searchCarrierMatches } from '../../api/carrierMatches';
import { useHotkeys } from '../../lib/useHotkeys';
import { EQUIPMENT_OPTIONS } from '../../lib/equipmentOptions';
import { useScreenMap } from '../../map/useScreenMap';
import CarrierSheet from '../../components/CarrierSheet';
import Skeleton from '../../components/Skeleton';
import ScreenPanel, { PanelTabs, PanelSearch, PlusButton, EmptyNote } from '../../ui/ScreenPanel';
import { SheetBackdrop, SHEET_SPRING } from '../../ui/Sheet';
import CarrierProfile from './CarrierProfile';
import LaneSearch, { blankLane, laneFromLoad, laneIsComplete } from './LaneSearch';
import { useCarrierHistory, lanesForHistory } from './useCarrierHistory';

const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT_OPTIONS.map((option) => [option.code, option.label]));
const TIER = {
  perfect: { label: 'Ran this lane', tone: 'bg-success/15 text-success' },
  strong: { label: 'Same origin', tone: 'bg-white/[0.1] text-text' },
  weak: { label: 'Nearby, deadhead', tone: 'bg-white/[0.06] text-text-muted' },
  regional_perfect: { label: 'Runs both states', tone: 'bg-white/[0.1] text-text' },
  regional: { label: 'Runs the origin state', tone: 'bg-white/[0.06] text-text-muted' },
};

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

function routeFrom(pathname) {
  if (pathname.startsWith('/carriers/find')) return { mode: 'find', openId: null };
  const match = pathname.match(/^\/carriers\/(\d+)/);
  return { mode: 'directory', openId: match ? Number(match[1]) : null };
}

function CarrierRow({ carrier, current, onOpen, onHover }) {
  const equipment = Array.isArray(carrier.equipment_types) ? carrier.equipment_types : [];
  return (
    <li onPointerEnter={() => onHover(carrier.id)} data-row-id={carrier.id}>
      <motion.button
        type="button"
        layoutId={`carrier-${carrier.id}`}
        transition={SHEET_SPRING}
        onClick={() => onOpen(carrier.id)}
        aria-label={`Open ${carrier.company_name}`}
        className={`flex w-full items-center gap-3.5 rounded-[18px] px-[14px] py-[11px] text-left transition-colors hover:bg-white/[0.065] ${current ? 'bg-white/[0.065]' : ''}`}
      >
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-white/[0.08] text-[12px] font-bold text-text-muted">
          {initials(carrier.company_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">{carrier.company_name}</span>
          <span className="mt-0.5 block truncate text-[12px] text-text-muted">
            {[carrier.mc_number && `MC ${carrier.mc_number}`, carrier.dispatcher_name, carrier.dispatcher_phone].filter(Boolean).join(' · ') || 'No contact on file'}
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          {equipment.slice(0, 3).map((code) => (
            <span key={code} title={EQUIPMENT_LABEL[code] || code} className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold text-text-muted">
              {code}
            </span>
          ))}
        </span>
      </motion.button>
    </li>
  );
}

function MatchRow({ match, searchedEquipment, current, onOpen, onHover }) {
  const tier = TIER[match.tier] || { label: match.tier, tone: 'bg-white/[0.06] text-text-muted' };
  const where = match.taggedStates ? match.taggedStates.join(', ') : `${Math.round(match.originDistanceMiles)} mi from the pickup`;
  return (
    <li onPointerEnter={() => onHover(match)} data-row-id={match.carrierId}>
      <motion.button
        type="button"
        layoutId={`carrier-${match.carrierId}`}
        transition={SHEET_SPRING}
        onClick={() => onOpen(match.carrierId)}
        aria-label={`Open ${match.carrierName}`}
        className={`grid w-full grid-cols-[1fr_auto] gap-x-3 rounded-[18px] px-[18px] py-[12px] text-left transition-colors hover:bg-white/[0.065] ${current ? 'bg-white/[0.065]' : ''}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">{match.carrierName}</span>
          <span className="mt-0.5 block truncate text-[12px] text-text-muted">{[where, match.mc_number && `MC ${match.mc_number}`, match.dispatcher_phone].filter(Boolean).join(' · ')}</span>
          {match.equipmentMismatch && (
            <span className="mt-1.5 inline-block rounded-full bg-hot/15 px-2 py-px text-[11px] font-medium text-hot">No {EQUIPMENT_LABEL[searchedEquipment] || searchedEquipment || 'matching equipment'} on file</span>
          )}
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={`whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold ${tier.tone}`}>{tier.label}</span>
          {match.laneCount > 1 && <span className="text-[11px] text-text-muted">{match.laneCount} lanes on file</span>}
        </span>
      </motion.button>
    </li>
  );
}

// Every carrier you work with, and who can take a lane. Opening a carrier
// draws every lane they have run for you on the map.
function CarriersScreen({ focusedLoad, onClearFocusedLoad }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, openId } = routeFrom(location.pathname);
  const histories = useCarrierHistory();

  const [carriers, setCarriers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const [hoverRun, setHoverRun] = useState(null);
  const [editing, setEditing] = useState(null); // null, 'new' or a carrier
  const [deleting, setDeleting] = useState(false);
  const [savedTick, setSavedTick] = useState(0);

  const [lane, setLane] = useState(() => laneFromLoad(focusedLoad));
  const [results, setResults] = useState(null); // { laneMatches, regionalMatches, queryOrigin, queryDest }
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchError, setSearchError] = useState(null);
  const [hoverMatch, setHoverMatch] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      Promise.resolve(listCarriers(query.trim() || undefined))
        .then((data) => {
          if (ignore) return;
          setCarriers(Array.isArray(data) ? data : []);
          setStatus('ready');
        })
        .catch((err) => {
          if (ignore) return;
          setError(err.message || 'Failed to load carriers.');
          setStatus('error');
        });
    }, query ? 250 : 0);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query]);

  function runSearch(request) {
    setSearchStatus('loading');
    setSearchError(null);
    Promise.resolve(request)
      .then((data) => {
        setResults(data);
        setSearchStatus('ready');
      })
      .catch((err) => {
        setSearchError(err.message || 'Failed to search for matches.');
        setSearchStatus('error');
      });
  }

  // Arriving from a load's "Find carriers" searches that load's lane.
  useEffect(() => {
    if (!focusedLoad) return;
    setLane(laneFromLoad(focusedLoad));
    runSearch(getCarrierMatchesForLoad(focusedLoad.id));
  }, [focusedLoad?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function searchLane() {
    if (!laneIsComplete(lane)) {
      setSearchError('Origin and destination city and state are required.');
      return;
    }
    runSearch(
      searchCarrierMatches({
        originCity: lane.originCity.trim(),
        originState: lane.originState.trim(),
        destCity: lane.destCity.trim(),
        destState: lane.destState.trim(),
        equipment: lane.equipment || null,
      })
    );
  }

  const shownId = openId ?? hoverId;
  useEffect(() => {
    if (shownId) histories.ensure(shownId);
  }, [shownId, histories]);

  const matches = results ? [...(results.laneMatches || []), ...(results.regionalMatches || [])] : [];
  const queryLane = results?.queryOrigin && results?.queryDest
    ? { id: 'query', from: [results.queryOrigin.lng, results.queryOrigin.lat], to: [results.queryDest.lng, results.queryDest.lat], fromLabel: lane.originCity, toLabel: lane.destCity, gold: false }
    : null;

  const shownHistory = shownId ? histories.historyOf(shownId) : null;
  const lanes = useMemo(() => {
    if (openId || (mode === 'directory' && hoverId)) return lanesForHistory(shownHistory);
    if (mode === 'find') {
      const matchLanes = (results?.laneMatches || [])
        .filter((match) => match.destLat !== null && match.destLng !== null)
        .map((match) => ({ id: `match-${match.carrierId}`, from: [match.originLng, match.originLat], to: [match.destLng, match.destLat], fromLabel: '', toLabel: '', gold: match.tier === 'perfect' }));
      return queryLane ? [queryLane, ...matchLanes] : matchLanes;
    }
    return [];
  }, [openId, mode, hoverId, shownHistory, results]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusId = openId ? hoverRun : mode === 'find' ? (hoverMatch ? `match-${hoverMatch.carrierId}` : queryLane ? 'query' : null) : null;
  useScreenMap({ lanes, focusId, sheetOpen: Boolean(openId) });

  function openCarrier(id) {
    navigate(`/carriers/${id}`);
  }
  function close() {
    navigate(mode === 'find' || results ? '/carriers/find' : '/carriers');
  }

  function removeCarrier(carrier) {
    setDeleting(true);
    deleteCarrier(carrier.id)
      .then(() => {
        setCarriers((prev) => prev.filter((c) => c.id !== carrier.id));
        histories.forget(carrier.id);
        navigate('/carriers');
      })
      .catch((err) => setError(err.message || 'Failed to delete the carrier.'))
      .finally(() => setDeleting(false));
  }

  const rowIds = mode === 'find' ? matches.map((m) => m.carrierId) : carriers.map((c) => c.id);
  useHotkeys({
    n: () => setEditing('new'),
    ArrowDown: () => {
      const index = rowIds.indexOf(hoverId);
      const next = rowIds[Math.min(rowIds.length - 1, index + 1)];
      if (next) setHoverId(next);
    },
    ArrowUp: () => {
      const index = rowIds.indexOf(hoverId);
      const next = rowIds[Math.max(0, index - 1)];
      if (next) setHoverId(next);
    },
    Enter: () => hoverId && openCarrier(hoverId),
  });

  return (
    <>
      <ScreenPanel
        ref={listRef}
        label="Carriers"
        count={mode === 'find' ? matches.length : carriers.length}
        caption={mode === 'find' ? 'Lane search' : 'Directory'}
        title={mode === 'find' ? (results ? 'carriers for this lane' : 'find carriers for a lane') : 'carriers on file'}
        pushedBack={Boolean(openId)}
        onPointerLeave={() => {
          setHoverId(null);
          setHoverMatch(null);
        }}
        action={<PlusButton label="Add carrier" onClick={() => setEditing('new')} />}
        tabs={
          <PanelTabs
            label="Carriers view"
            value={mode}
            onChange={(next) => navigate(next === 'find' ? '/carriers/find' : '/carriers')}
            options={[
              { value: 'directory', label: 'Directory', count: carriers.length },
              { value: 'find', label: 'Find for a lane' },
            ]}
          />
        }
        toolbar={
          mode === 'find' ? (
            <LaneSearch
              lane={lane}
              onChange={setLane}
              onSearch={searchLane}
              searching={searchStatus === 'loading'}
              loadNumber={focusedLoad?.load_number}
              onClearLoad={() => {
                setLane(blankLane());
                setResults(null);
                setSearchStatus('idle');
                onClearFocusedLoad?.();
              }}
            />
          ) : (
            <PanelSearch label="Search carriers" placeholder="Search company, MC, dispatcher" value={query} onChange={setQuery} />
          )
        }
      >
        {mode === 'directory' && (
          <>
            {status === 'loading' && (
              <div className="px-2 pt-2">
                <Skeleton count={6} height="3.6rem" className="rounded-[18px]" />
              </div>
            )}
            {status === 'error' && (
              <p role="alert" className="px-4 py-6 text-sm text-error">
                {error}
              </p>
            )}
            {status === 'ready' && carriers.length === 0 && (
              <EmptyNote title={query ? `No carrier matches "${query}".` : 'No carriers yet.'}>{query ? null : 'Add one with the plus, or book a load and save the carrier from there.'}</EmptyNote>
            )}
            {carriers.length > 0 && (
              <ul aria-label="Carriers">
                {carriers.map((carrier) => (
                  <CarrierRow key={carrier.id} carrier={carrier} current={hoverId === carrier.id} onOpen={openCarrier} onHover={setHoverId} />
                ))}
              </ul>
            )}
          </>
        )}
        {mode === 'find' && (
          <>
            {searchError && (
              <p role="alert" className="mx-2 mb-2 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
                {searchError}
              </p>
            )}
            {searchStatus === 'loading' && (
              <div className="px-2 pt-2">
                <Skeleton count={4} height="3.8rem" className="rounded-[18px]" />
              </div>
            )}
            {searchStatus === 'idle' && <EmptyNote title="Where is the load going?">Type a lane above, or open a load and choose Find carriers.</EmptyNote>}
            {searchStatus === 'ready' && matches.length === 0 && <EmptyNote title="No carriers for this lane yet.">Carriers show up here once they have run nearby, or are tagged for these states.</EmptyNote>}
            {searchStatus === 'ready' && results?.laneMatches?.length > 0 && (
              <ul aria-label="Lane matches">
                {results.laneMatches.map((match) => (
                  <MatchRow key={match.carrierId} match={match} searchedEquipment={lane.equipment} current={hoverMatch?.carrierId === match.carrierId} onOpen={openCarrier} onHover={setHoverMatch} />
                ))}
              </ul>
            )}
            {searchStatus === 'ready' && results?.regionalMatches?.length > 0 && (
              <>
                <p className="caps px-4 pb-1 pt-3">No runs yet, tagged for the region</p>
                <ul aria-label="Regional matches">
                  {results.regionalMatches.map((match) => (
                    <MatchRow key={match.carrierId} match={match} searchedEquipment={lane.equipment} current={hoverMatch?.carrierId === match.carrierId} onOpen={openCarrier} onHover={setHoverMatch} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </ScreenPanel>

      {openId && <SheetBackdrop onClose={close} />}
      <AnimatePresence>
        {openId && (
          <CarrierProfile
            key={openId}
            carrierId={openId}
            history={histories.historyOf(openId)}
            refreshKey={savedTick}
            onClose={close}
            onEdit={setEditing}
            onDelete={removeCarrier}
            onHoverRun={setHoverRun}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editing && (
          <CarrierSheet
            carrier={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              if (!saved) return;
              setCarriers((prev) => (prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev]));
              // Runs may have been added or edited in the form.
              histories.forget(saved.id);
              histories.ensure(saved.id);
              setSavedTick((t) => t + 1);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default CarriersScreen;
