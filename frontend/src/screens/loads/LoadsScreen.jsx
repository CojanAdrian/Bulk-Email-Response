import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../../api/loads';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../../lib/dateInput';
import { useSelectionMode } from '../../lib/useSelectionMode';
import { usePersistentState } from '../../lib/usePersistentState';
import { useHotkeys } from '../../lib/useHotkeys';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { setLanes, setFocus, setInsets } from '../../map/mapStore';
import { roadMiles } from '../../map/geo';
import { useShell } from '../../shell/ShellContext';
import RateModal from '../../components/RateModal';
import AddLoadModal from '../../components/AddLoadModal';
import BlastModal from '../../components/BlastModal';
import BookingCarrierModal from '../../components/BookingCarrierModal';
import DatExportSection from '../../components/DatExportSection';
import BottomActionBar from '../../components/BottomActionBar';
import Select from '../../components/Select';
import Skeleton from '../../components/Skeleton';
import { SearchIcon } from '../../components/icons';
import BoardRow from './BoardRow';
import LoadSheet from './LoadSheet';
import NeedsReply from './NeedsReply';
import TodayCard from '../../shell/TodayCard';
import { useSettings } from '../../shell/SettingsContext';
import { useBoard } from './useBoard';
import { SORTS, STATUSES, STATUS_LABELS, countByStatus, hasNoRate, lanesFor, visibleLoads } from './boardLogic';

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const BULK_RATE_OPTIONS = [
  { value: 'include', label: 'Include rate' },
  { value: 'exclude', label: 'Exclude rate' },
];
const HEADLINES = { active: 'loads to cover', booked: 'loads booked', covered: 'loads covered' };
const TOOL = 'rounded-full px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-white/10 hover:text-text';
const CHIP = 'rounded-full px-2.5 py-1 text-xs font-medium transition-colors';
// Panel widths plus their margins: the map fits itself between these.
const MAP_INSET_LEFT = 606;
// An open load is wider than the board.
const MAP_INSET_LEFT_OPEN = 700;
const MAP_INSET_RIGHT = 366;

function openIdFrom(pathname) {
  const match = pathname.match(/^\/loads\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function LoadsScreen({ refreshKey, onViewMatches }) {
  const navigate = useNavigate();
  const location = useLocation();
  const shell = useShell();
  const board = useBoard(refreshKey);
  const { loads, proven, matches, asking, waiting, reload } = board;

  const [tab, setTab] = useState('active');
  const [quick, setQuick] = usePersistentState('loadsTable.quickFilter', 'all');
  const { settings, update } = useSettings();
  const sort = settings.board.sort || 'newest';
  const setSort = (value) => update({ board: { sort: value } });
  const [query, setQuery] = useState('');
  const [currentId, setCurrentId] = useState(null);
  const [hoveredInquiryLoad, setHoveredInquiryLoad] = useState(null);
  const selection = useSelectionMode();

  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [actionError, setActionError] = useState(null);
  // A pickup edit is shown from here until the next fetch confirms it, so
  // picking a day and then a time (two saves) never loses the first one.
  const [pickupOverrides, setPickupOverrides] = useState({});

  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [blast, setBlast] = useState(null); // { load, emails }
  const [booking, setBooking] = useState(null);
  const datExport = useRef(null);
  const fileInput = useRef(null);
  const listRef = useRef(null);

  const wide = useMediaQuery('(min-width: 768px)');
  const widest = useMediaQuery('(min-width: 1180px)');

  const counts = useMemo(() => countByStatus(loads), [loads]);
  const inTab = useMemo(() => loads.filter((load) => load.status === tab), [loads, tab]);
  const provenCount = useMemo(() => inTab.filter((load) => proven[load.id]?.length).length, [inTab, proven]);
  const needsRateCount = useMemo(() => inTab.filter(hasNoRate).length, [inTab]);
  const rows = useMemo(() => visibleLoads({ loads, status: tab, quick, query, sort, proven }), [loads, tab, quick, query, sort, proven]);

  const openId = openIdFrom(location.pathname);
  const openLoad = useMemo(() => (openId === null ? null : loads.find((load) => load.id === openId) || null), [loads, openId]);

  useEffect(() => {
    setPickupOverrides({});
  }, [loads]);

  // The map shows the lanes of the loads on screen and follows whichever
  // one is open, selected with the keyboard, or hovered.
  useEffect(() => {
    setLanes(lanesFor(rows, proven));
  }, [rows, proven]);
  useEffect(() => {
    setFocus(openId ?? hoveredInquiryLoad ?? currentId);
  }, [openId, hoveredInquiryLoad, currentId]);
  useEffect(() => {
    const left = !wide ? 0 : openId === null ? MAP_INSET_LEFT : MAP_INSET_LEFT_OPEN;
    setInsets({ left, right: widest ? MAP_INSET_RIGHT : 0 });
  }, [wide, widest, openId]);
  useEffect(
    () => () => {
      setLanes([]);
      setFocus(null);
      setInsets({ left: 0, right: 0 });
    },
    []
  );

  function open(load) {
    navigate(`/loads/${load.id}`);
  }
  function close() {
    navigate('/loads');
  }

  function run(promise, fallbackMessage) {
    setActionError(null);
    return promise.then(reload).catch((err) => setActionError(err.message || fallbackMessage));
  }

  function changeStatus(load, status) {
    setBusyId(load.id);
    run(
      updateLoad(load.id, { status }).then(() => {
        if (status === 'booked' && load.status !== 'booked') setBooking(load);
      }),
      'Failed to update status.'
    ).finally(() => setBusyId(null));
  }

  function changeIncludeRate(load, checked) {
    setBusyId(load.id);
    run(updateLoad(load.id, { include_rate: checked }), 'Failed to update rate.').finally(() => setBusyId(null));
  }

  function saveRate(load, draft) {
    const text = String(draft).trim();
    const value = text === '' ? null : Number(text);
    if (value !== null && Number.isNaN(value)) {
      setActionError('Target pay must be a number.');
      return;
    }
    setBusyId(load.id);
    run(updateLoad(load.id, { target_pay: value }), 'Failed to update target pay.').finally(() => setBusyId(null));
  }

  function pickupValuesFor(load) {
    return pickupOverrides[load.id] ?? { early_pu: isoToDatetimeLocal(load.early_pu), late_pu: isoToDatetimeLocal(load.late_pu) };
  }

  function changePickup(load, field, value) {
    setPickupOverrides((prev) => ({ ...prev, [load.id]: { ...pickupValuesFor(load), [field]: value } }));
    setActionError(null);
    updateLoad(load.id, { [field]: datetimeLocalToMysql(value) }).catch((err) => setActionError(err.message || 'Failed to update pickup window.'));
  }

  function remove(load) {
    setBusyId(load.id);
    run(deleteLoad(load.id).then(close), 'Failed to delete load.').finally(() => setBusyId(null));
  }

  function bulk(promise, fallbackMessage) {
    setBulkBusy(true);
    run(
      promise.then(() => {
        selection.exit();
        setConfirmingBulkDelete(false);
      }),
      fallbackMessage
    ).finally(() => setBulkBusy(false));
  }

  function move(step) {
    if (rows.length === 0) return;
    const index = rows.findIndex((load) => load.id === currentId);
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + step))] || rows[0];
    setCurrentId(next.id);
    listRef.current?.querySelector(`[data-row-id="${next.id}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }

  const current = rows.find((load) => load.id === currentId) || null;
  useHotkeys({
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Enter: () => current && open(current),
    c: () => current && navigator.clipboard?.writeText?.(String(current.load_number)).then(() => shell.notify({ tone: 'success', title: `Copied ${current.load_number}` })),
    b: () => current && setBlast({ load: current, emails: '' }),
    n: () => setAdding(true),
  });

  const selectedIds = Array.from(selection.selectedIds);
  const emptyMessage = query.trim()
    ? `No loads match "${query}".`
    : quick === 'proven'
      ? 'No proven lanes in this view yet.'
      : quick === 'needs_rate'
        ? 'Every load here has a rate.'
        : null;

  return (
    <>
      <section
        aria-label="Load board"
        // Behind an open load the board cannot be clicked or tabbed into.
        inert={openLoad ? '' : undefined}
        className={`mat relative mx-3 mb-28 mt-2 flex min-h-[70vh] origin-[50%_55%] flex-col overflow-hidden rounded-[30px] transition-[scale,filter] duration-700 ease-soft motion-safe:animate-[rise-in_1.1s_var(--spring)_both] md:fixed md:bottom-[104px] md:left-9 md:top-[84px] md:z-10 md:m-0 md:min-h-0 md:w-[540px] ${
          openLoad ? 'scale-95 brightness-[0.45]' : ''
        }`}
      >
        <header className="flex items-end gap-3.5 px-7 pt-[26px]">
          <p className="text-[84px] font-bold leading-[0.8] tracking-[-0.065em] tabular-nums" aria-hidden="true">
            {counts[tab]}
          </p>
          <div className="pb-1">
            <p className="caps">Live board</p>
            <h1 className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em]">
              <span className="sr-only">{counts[tab]} </span>
              {HEADLINES[tab]}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add load"
            title="Add load (N)"
            className="mb-1 ml-auto grid h-10 w-10 place-items-center rounded-full bg-accent text-[22px] font-light text-accent-ink transition-[scale,rotate] duration-500 ease-spring hover:rotate-90 hover:scale-110"
          >
            +
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-x-5 border-b border-white/[0.07] px-7 pt-5">
          <div role="group" aria-label="Show loads by status" className="flex gap-5">
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={tab === status}
                aria-label={`${STATUS_LABELS[status]}: ${counts[status]} loads`}
                onClick={() => {
                  setTab(status);
                  selection.exit();
                }}
                className={`-mb-px border-b-[1.5px] pb-3 text-[13px] font-medium transition-colors ${
                  tab === status ? 'border-text text-text' : 'border-transparent text-text/30 hover:text-text-muted'
                }`}
              >
                {STATUS_LABELS[status]}
                <span className="ml-1.5 tabular-nums opacity-60">{counts[status]}</span>
              </button>
            ))}
          </div>
          <div className="-mx-3 flex items-center pb-2 sm:mx-0 sm:ml-auto">
            <button type="button" onClick={() => fileInput.current?.click()} className={TOOL}>
              Import
            </button>
            <button type="button" onClick={() => datExport.current?.openExportFlow()} className={TOOL}>
              DAT export
            </button>
            {rows.length > 0 && (
              <button type="button" onClick={selection.active ? selection.exit : selection.enter} className={TOOL}>
                {selection.active ? 'Done' : 'Select'}
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".csv"
              aria-label="Upload loads CSV"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files[0];
                event.target.value = '';
                if (file) shell.importFile(file);
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          <label className="relative min-w-[10rem] flex-1">
            <span className="sr-only">Search loads</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              aria-label="Search loads"
              data-hotkey-search
              placeholder="Search load #, city, state, customer"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-full border py-2 pl-9 pr-3 text-[13px] text-text"
            />
          </label>
          <Select ariaLabel="Sort loads" value={sort} onChange={setSort} options={SORTS} size="sm" className="shrink-0" />
          <div role="group" aria-label="Quick filter" className="flex w-full gap-1">
            {[
              { value: 'all', label: 'All', count: inTab.length },
              { value: 'proven', label: 'Proven', count: provenCount },
              { value: 'needs_rate', label: 'Needs rate', count: needsRateCount },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={quick === option.value}
                onClick={() => setQuick(option.value)}
                className={`${CHIP} ${quick === option.value ? 'bg-white/[0.12] text-text' : 'text-text-muted hover:text-text'} ${
                  option.value === 'proven' && quick === 'proven' ? '!text-gold' : ''
                }`}
              >
                {option.label} <span className="tabular-nums opacity-60">{option.count}</span>
              </button>
            ))}
            {selection.active && (
              <button type="button" onClick={() => selection.selectAll(rows.map((load) => load.id))} className={`${CHIP} ml-auto text-text-muted hover:text-text`}>
                Select all
              </button>
            )}
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3.5 pt-2 [scrollbar-width:none]" onPointerLeave={() => setCurrentId(null)}>
          {board.status === 'loading' && (
            <div className="px-2 pt-2">
              <Skeleton count={5} height="3.6rem" className="rounded-[18px]" />
            </div>
          )}
          {board.status === 'error' && (
            <p role="alert" className="px-4 py-6 text-sm text-error">
              {board.error}
            </p>
          )}
          {actionError && !openLoad && (
            <p role="alert" className="mx-2 mb-2 rounded-xl bg-error-bg px-3 py-2 text-sm text-error">
              {actionError}
            </p>
          )}
          {board.status === 'ready' && inTab.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-base font-semibold text-text">No loads found.</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-text-muted">
                {tab === 'active' ? 'Drop a McLeod CSV anywhere on this window, paste it, or press N to add a load by hand.' : `Nothing is marked ${STATUS_LABELS[tab].toLowerCase()} yet.`}
              </p>
            </div>
          )}
          {board.status === 'ready' && inTab.length > 0 && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-text-muted">{emptyMessage}</p>}
          {rows.length > 0 && (
            <ul aria-label="Loads">
              {rows.map((load) => (
                <BoardRow
                  key={load.id}
                    load={load}
                    regulars={proven[load.id]}
                    asking={asking[load.id] || 0}
                    matchCount={matches[load.id]?.count || 0}
                    current={currentId === load.id}
                    selecting={selection.active}
                    selected={selection.isSelected(load.id)}
                    onOpen={open}
                    onHover={setCurrentId}
                    onToggleSelect={selection.toggle}
                    onEmail={(target, emails) => setBlast({ load: target, emails })}
                    onOpenCarrier={(id) => navigate(`/carriers/${id}`)}
                  />
              ))}
            </ul>
          )}
          <div className="mt-4 px-2">
            <DatExportSection ref={datExport} refreshKey={refreshKey} />
          </div>
        </div>

        <div className="px-3">
          <BottomActionBar count={selection.selectedIds.size}>
            <Select ariaLabel="Mark selected as" value="" placeholder="Mark as…" onChange={(status) => status && bulk(bulkUpdateLoadStatus(selectedIds, status), 'Failed to update selected loads.')} options={STATUS_OPTIONS} disabled={bulkBusy} size="sm" />
            <Select ariaLabel="Rate for selected" value="" placeholder="Rate…" onChange={(value) => value && bulk(bulkSetIncludeRate(selectedIds, value === 'include'), 'Failed to update rate for selected loads.')} options={BULK_RATE_OPTIONS} disabled={bulkBusy} size="sm" />
            {confirmingBulkDelete ? (
              <>
                <span className="text-xs text-error">Delete {selectedIds.length}?</span>
                <button type="button" onClick={() => bulk(bulkDeleteLoads(selectedIds), 'Failed to delete selected loads.')} disabled={bulkBusy} className="rounded-full bg-error px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60">
                  {bulkBusy ? 'Deleting...' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setConfirmingBulkDelete(false)} disabled={bulkBusy} className="rounded-full bg-white/10 px-3 py-1.5 text-xs disabled:opacity-60">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingBulkDelete(true)} disabled={bulkBusy} className="rounded-full px-3 py-1.5 text-xs text-error hover:bg-error-bg disabled:opacity-60">
                Delete selected
              </button>
            )}
            <button type="button" onClick={selection.clear} disabled={bulkBusy} className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-xs disabled:opacity-60">
              Clear selection
            </button>
          </BottomActionBar>
        </div>
      </section>

      {widest && (
        <aside className="fixed bottom-[104px] right-9 top-24 z-[9] flex w-[300px] flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
          <NeedsReply inquiries={waiting} onHoverLoad={setHoveredInquiryLoad} />
          <div className="mt-auto">
            <TodayCard />
          </div>
        </aside>
      )}

      {openLoad && <div className="fixed inset-0 z-[34] bg-black/20" onClick={close} aria-hidden="true" />}
      <AnimatePresence>
        {openLoad && (
          <LoadSheet
            key={openLoad.id}
            load={openLoad}
            regulars={proven[openLoad.id]}
            asking={asking[openLoad.id] || 0}
            matchCount={matches[openLoad.id]?.count || 0}
            miles={roadMiles([Number(openLoad.origin_lng), Number(openLoad.origin_lat)], [Number(openLoad.dest_lng), Number(openLoad.dest_lat)])}
            busy={busyId === openLoad.id}
            error={actionError}
            pickupValues={pickupValuesFor(openLoad)}
            onClose={close}
            onStatusChange={changeStatus}
            onIncludeRateChange={changeIncludeRate}
            onSaveRate={saveRate}
            onPickupChange={changePickup}
            onBlast={(load) => setBlast({ load, emails: '' })}
            onFindCarriers={onViewMatches}
            onEdit={setEditing}
            onDelete={remove}
            onEmail={(load, emails) => setBlast({ load, emails })}
            onOpenCarrier={(id) => navigate(`/carriers/${id}`)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <RateModal
            load={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
        {adding && (
          <AddLoadModal
            onClose={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              reload();
            }}
          />
        )}
        {blast && <BlastModal load={blast.load} initialShowRate={false} initialEmails={blast.emails} onClose={() => setBlast(null)} />}
        {booking && <BookingCarrierModal load={booking} onClose={() => setBooking(null)} />}
      </AnimatePresence>
    </>
  );
}

export default LoadsScreen;
