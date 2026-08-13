import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import Card from './Card';

function StatBlock({ label, value, accentClassName }) {
  return (
    <Card className="!p-4 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accentClassName}`}>{value}</p>
    </Card>
  );
}

function LoadsStatsRow({ refreshKey }) {
  const [counts, setCounts] = useState(null);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    listLoads()
      .then((data) => {
        if (ignore) return;
        const next = { active: 0, booked: 0, covered: 0 };
        data.forEach((load) => {
          if (next[load.status] !== undefined) next[load.status] += 1;
        });
        setCounts(next);
      })
      .catch(() => {
        if (!ignore) setCounts(null);
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, liveTick]);

  useEffect(() => {
    return subscribe('load:changed', () => setLiveTick((t) => t + 1));
  }, []);

  if (!counts) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatBlock label="Active" value={counts.active} accentClassName="text-success" />
      <StatBlock label="Booked" value={counts.booked} accentClassName="text-tag" />
      <StatBlock label="Covered" value={counts.covered} accentClassName="text-tag" />
    </div>
  );
}

export default LoadsStatsRow;
