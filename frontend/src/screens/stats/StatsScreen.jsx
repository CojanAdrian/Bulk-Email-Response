import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getLoadsStats } from '../../api/loads';
import { subscribe } from '../../lib/liveSocket';
import { STATS_PRESETS, rangeForPreset } from '../../lib/statsDateRanges';
import { formatMoney } from '../../lib/formatMoney';
import { usePersistentState } from '../../lib/usePersistentState';
import { useScreenMap, laneFromRow } from '../../map/useScreenMap';
import { useSettings } from '../../shell/SettingsContext';
import DateField from '../../components/DateField';
import Select from '../../components/Select';
import Skeleton from '../../components/Skeleton';
import ScreenPanel, { Chips, EmptyNote } from '../../ui/ScreenPanel';
import CopyText from '../../ui/CopyText';

const SORTS = [
  { value: 'booked_at:desc', label: 'Newest booked' },
  { value: 'gp:desc', label: 'Margin, high to low' },
  { value: 'gp:asc', label: 'Margin, low to high' },
  { value: 'rate:desc', label: 'Rate paid, high to low' },
  { value: 'target_pay:desc', label: 'Target pay, high to low' },
  { value: 'load_number:asc', label: 'Load number' },
];

function bookedAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shortDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Gross profit per day across the range, as bars that grow in.
function ProfitChart({ loads, onHoverDay, hoverDay }) {
  const days = useMemo(() => {
    const byDay = new Map();
    for (const load of loads) {
      const entry = byDay.get(load.booked_date) || { gp: 0, count: 0 };
      entry.gp += Number(load.gp) || 0;
      entry.count += 1;
      byDay.set(load.booked_date, entry);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-21).map(([day, entry]) => ({ day, ...entry }));
  }, [loads]);
  const max = Math.max(1, ...days.map((d) => d.gp));
  if (days.length === 0) return null;
  const hovered = days.find((d) => d.day === hoverDay);

  return (
    <div onPointerLeave={() => onHoverDay(null)}>
      <p className="caps flex justify-between">
        <span>Margin by day</span>
        {hovered && (
          <span className="normal-case tracking-normal text-text">
            {shortDay(hovered.day)} · {formatMoney(hovered.gp)} · {hovered.count} load{hovered.count === 1 ? '' : 's'}
          </span>
        )}
      </p>
      <div className="mt-3 flex h-[110px] items-end gap-1" role="img" aria-label="Gross profit by day">
        {days.map((d, index) => (
          <motion.button
            type="button"
            key={d.day}
            aria-label={`${shortDay(d.day)}: ${formatMoney(d.gp)}`}
            onPointerEnter={() => onHoverDay(d.day)}
            onFocus={() => onHoverDay(d.day)}
            className={`min-w-[6px] flex-1 rounded-[4px] transition-colors ${hoverDay === d.day ? 'bg-success' : 'bg-white/[0.22] hover:bg-white/40'}`}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(3, (d.gp / max) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.3 + index * 0.03 }}
          />
        ))}
      </div>
    </div>
  );
}

// Booked loads with what was paid and earned on each, for a date range.
function StatsScreen() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [preset, setPreset] = usePersistentState('stats.preset', 'lastWeek');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [usingCustom, setUsingCustom] = useState(false);
  const [sort, setSort] = usePersistentState('stats.sort', 'booked_at:desc');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const [hoverId, setHoverId] = useState(null);
  const [hoverDay, setHoverDay] = useState(null);

  const range = usingCustom ? { from: custom.from || null, to: custom.to || null } : rangeForPreset(preset);
  const [sortKey, direction] = sort.split(':');

  useEffect(() => {
    let ignore = false;
    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    Promise.resolve(getLoadsStats({ from: range.from, to: range.to, sort: sortKey, direction }))
      .then((res) => {
        if (ignore) return;
        setData(res);
        setError(null);
        setStatus('ready');
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message || 'Failed to load stats.');
        setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, [range.from, range.to, sortKey, direction, tick]);

  useEffect(() => subscribe('load:changed', () => setTick((t) => t + 1)), []);

  const loads = data?.loads || [];
  const totals = data?.totals || { count: 0, totalGp: 0, totalRate: 0, totalTargetPay: 0 };
  const withGp = loads.filter((load) => load.gp !== null && load.gp !== undefined);
  const avgGp = withGp.length ? totals.totalGp / withGp.length : null;
  const { marginPerLoad, weeklyGp } = settings.targets;
  const lanes = useMemo(() => loads.map((load) => laneFromRow(load.id, load)).filter(Boolean), [loads]);
  const dayLoads = hoverDay ? new Set(loads.filter((load) => load.booked_date === hoverDay).map((load) => load.id)) : null;
  const { widest } = useScreenMap({ lanes, focusId: hoverId, rightColumn: true });

  const presetLabel = usingCustom ? 'Custom range' : STATS_PRESETS.find((p) => p.key === preset)?.label || '';
  const weekly = !usingCustom && preset === 'lastWeek';

  return (
    <>
      <ScreenPanel
        label="Stats"
        count={totals.count}
        caption={presetLabel}
        title={totals.count === 1 ? 'load booked' : 'loads booked'}
        onPointerLeave={() => setHoverId(null)}
        toolbar={
          <>
            <Chips
              label="Date range"
              value={usingCustom ? null : preset}
              onChange={(key) => {
                setUsingCustom(false);
                setPreset(key);
              }}
              options={STATS_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
              className="w-full"
            />
            <div className="flex w-full flex-wrap items-center gap-2 text-xs text-text-muted">
              <DateField ariaLabel="Custom from date" value={custom.from} onChange={(v) => { setUsingCustom(true); setCustom((c) => ({ ...c, from: v })); }} className="w-36" />
              <span>to</span>
              <DateField ariaLabel="Custom to date" value={custom.to} onChange={(v) => { setUsingCustom(true); setCustom((c) => ({ ...c, to: v })); }} className="w-36" />
              <Select ariaLabel="Sort booked loads" value={sort} onChange={setSort} options={SORTS} size="sm" className="ml-auto" />
            </div>
          </>
        }
      >
        {status === 'loading' && (
          <div className="px-2 pt-2">
            <Skeleton count={5} height="3.6rem" className="rounded-[18px]" />
          </div>
        )}
        {status === 'error' && (
          <p role="alert" className="px-4 py-6 text-sm text-error">
            {error}
          </p>
        )}
        {status === 'ready' && loads.length === 0 && <EmptyNote title="No booked loads in this period.">Mark a load booked and log its carrier to see it here.</EmptyNote>}
        {loads.length > 0 && (
          <ul aria-label="Booked loads">
            {loads.map((load) => {
              const low = load.gp !== null && load.gp !== undefined && Number(load.gp) < marginPerLoad;
              const dimmed = dayLoads && !dayLoads.has(load.id);
              return (
                <li key={load.id} onPointerEnter={() => setHoverId(load.id)} className={`transition-opacity duration-300 ${dimmed ? 'opacity-30' : ''}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/loads/${load.id}`)}
                    aria-label={`Open load ${load.load_number}`}
                    className={`grid w-full grid-cols-[1fr_auto] gap-x-3 rounded-[18px] px-[18px] py-[12px] text-left transition-colors hover:bg-white/[0.065] ${hoverId === load.id ? 'bg-white/[0.065]' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">
                        {load.origin_city}, {load.origin_state}
                        <span className="px-1.5 text-text/30">→</span>
                        {load.dest_city}, {load.dest_state}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-text-muted">
                        <CopyText value={load.load_number} label={`Copy load number ${load.load_number}`} />
                        <span>{bookedAt(load.booked_at)}</span>
                        {load.carrier_name && <span className="truncate text-text">{load.carrier_name}</span>}
                        {load.customer && <span className="truncate">{load.customer}</span>}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`block text-[17px] font-semibold tabular-nums tracking-[-0.03em] ${load.gp === null || load.gp === undefined ? 'text-text-muted' : low ? 'text-hot' : 'text-success'}`}>
                        {load.gp === null || load.gp === undefined ? 'No margin' : `+${formatMoney(load.gp)}`}
                      </span>
                      <span className="block text-[11.5px] tabular-nums text-text-muted">paid {formatMoney(load.rate)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScreenPanel>

      {widest && (
        <aside className="fixed right-9 top-24 z-[9] w-[300px] space-y-3">
          <section aria-label="Gross profit" className="mat rounded-[28px] p-[18px] motion-safe:animate-[slide-in_1s_var(--spring)_0.3s_both]">
            <p className="caps">Gross profit</p>
            <p className="mt-2 text-[44px] font-bold leading-none tracking-[-0.055em] tabular-nums text-success">{formatMoney(totals.totalGp)}</p>
            {weekly && weeklyGp > 0 && (
              <div className="mt-3">
                <div className="h-[5px] overflow-hidden rounded-full bg-white/10">
                  <motion.i
                    className="block h-full rounded-full bg-success"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (totals.totalGp / weeklyGp) * 100)}%` }}
                    transition={{ duration: 1.4, ease: [0.32, 0.72, 0, 1], delay: 0.6 }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-text-muted">{Math.round((totals.totalGp / weeklyGp) * 100)}% of your {formatMoney(weeklyGp)} weekly target</p>
              </div>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3.5">
              <div>
                <dt className="caps">Avg per load</dt>
                <dd className={`mt-1 text-[20px] font-semibold tabular-nums tracking-[-0.03em] ${avgGp !== null && avgGp < marginPerLoad ? 'text-hot' : ''}`}>{avgGp === null ? '—' : formatMoney(Math.round(avgGp))}</dd>
              </div>
              <div>
                <dt className="caps">Rate paid</dt>
                <dd className="mt-1 text-[20px] font-semibold tabular-nums tracking-[-0.03em]">{formatMoney(totals.totalRate)}</dd>
              </div>
            </dl>
          </section>
          {loads.length > 0 && (
            <section className="mat rounded-[28px] p-[18px] motion-safe:animate-[slide-in_1s_var(--spring)_0.45s_both]">
              <ProfitChart loads={loads} hoverDay={hoverDay} onHoverDay={setHoverDay} />
            </section>
          )}
        </aside>
      )}
    </>
  );
}

export default StatsScreen;
