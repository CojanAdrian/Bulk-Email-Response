import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToday } from '../api/stats';
import { subscribe } from '../lib/liveSocket';
import { formatMoney } from '../lib/formatMoney';
import { Ring, Bars } from '../ui/controls';
import { useSettings } from './SettingsContext';

const HOURS_SHOWN = 8;

function goalLine(booked, goal) {
  if (booked >= goal) return <><b className="font-semibold text-success">Goal reached</b> for today</>;
  const left = goal - booked;
  return <><b className="font-semibold text-text">{left} more</b> to hit today's goal</>;
}

// Today at a glance: loads booked against the daily goal, the margin made
// on them so far today, and how quickly inquiries are being answered.
// Clicking it opens Stats.
function TodayCard() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [today, setToday] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    Promise.resolve(getToday())
      .then((data) => {
        if (!ignore && data) setToday(data);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [tick]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offLoads = subscribe('load:changed', bump);
    const offInquiries = subscribe('inquiry:updated', bump);
    return () => {
      offLoads();
      offInquiries();
    };
  }, []);

  if (!today) return null;
  const { loadsPerDay, replyMinutes } = settings.targets;
  const margin = today.gpToday ?? null;
  const unlogged = today.bookedToday - (today.gpLoggedToday ?? 0);
  const hours = new Array(HOURS_SHOWN).fill(0);
  const nowHour = new Date().getHours();
  for (const { hour, replies } of today.repliesByHour || []) {
    const slot = HOURS_SHOWN - 1 - (nowHour - hour);
    if (slot >= 0 && slot < HOURS_SHOWN) hours[slot] = replies;
  }
  const slow = today.medianReplyMinutes !== null && today.medianReplyMinutes > replyMinutes;

  return (
    <button
      type="button"
      onClick={() => navigate('/stats')}
      aria-label="Today. Open Stats"
      className="mat grid w-full grid-cols-[96px_1fr] items-center gap-x-4 gap-y-3.5 rounded-[28px] p-[18px] text-left transition-[scale] duration-500 ease-spring hover:scale-[1.03] motion-safe:animate-[slide-in_1.1s_var(--spring)_0.5s_both]"
    >
      <Ring value={today.bookedToday} goal={loadsPerDay} label={`${today.bookedToday} of ${loadsPerDay} loads booked today`} />
      <div>
        <p className="caps">Booked today</p>
        <p className="mt-1.5 text-[12.5px] leading-snug text-text-muted">{goalLine(today.bookedToday, loadsPerDay)}</p>
      </div>

      <div className="col-span-2 border-t border-white/[0.07] pt-3.5">
        <p className="caps">Margin today</p>
        <p className={`mt-1 text-[26px] font-bold leading-tight tracking-[-0.045em] tabular-nums ${margin > 0 ? 'text-success' : ''}`}>{margin === null ? 'None yet' : formatMoney(margin)}</p>
        <p className="text-[11.5px] text-text-muted">
          {today.bookedToday === 0 ? 'Nothing booked yet today' : `From ${today.bookedToday} booked load${today.bookedToday === 1 ? '' : 's'}`}
          {unlogged > 0 && margin !== null ? ` · ${unlogged} without a margin` : ''}
        </p>
      </div>

      <div className="col-span-2 flex items-end justify-between gap-3.5 border-t border-white/[0.07] pt-3.5">
        <div>
          <p className="caps">Reply time</p>
          <p className={`mt-1 text-[26px] font-bold leading-tight tracking-[-0.045em] tabular-nums ${slow ? 'text-hot' : ''}`}>{today.medianReplyMinutes === null ? 'None yet' : `${today.medianReplyMinutes} min`}</p>
          <p className="text-[11.5px] text-text-muted">{today.repliedToday} replied today</p>
        </div>
        <Bars values={hours} highlight={2} label="Replies per hour, last 8 hours" />
      </div>
    </button>
  );
}

export default TodayCard;
