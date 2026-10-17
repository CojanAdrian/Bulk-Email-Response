import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import StatTile from './StatTile';


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
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <StatTile label="Active" value={counts.active} accentClassName="text-success" />
      <StatTile label="Booked" value={counts.booked} accentClassName="text-tag" />
      <StatTile label="Covered" value={counts.covered} accentClassName="text-tag" />
    </div>
  );
}

export default LoadsStatsRow;
