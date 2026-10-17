import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import StatTile from './StatTile';


function LoadsStatsRow({ refreshKey, activeStatus, onSelectStatus }) {
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
    <div role="group" aria-label="Show loads by status" className="grid grid-cols-3 gap-2 sm:gap-4">
      {[
        { key: 'active', label: 'Active', accent: 'text-success', ring: 'ring-success/60' },
        { key: 'booked', label: 'Booked', accent: 'text-tag', ring: 'ring-tag/60' },
        { key: 'covered', label: 'Covered', accent: 'text-info', ring: 'ring-info/60' },
      ].map((tile) =>
        onSelectStatus ? (
          // Each counter is also the board's status filter: click "Booked" to
          // see the booked loads.
          <button
            key={tile.key}
            type="button"
            aria-pressed={activeStatus === tile.key}
            aria-label={`${tile.label}: ${counts[tile.key]} loads`}
            onClick={() => onSelectStatus(tile.key)}
            className={`min-w-0 rounded-3xl text-left transition duration-200 ease-smooth hover:-translate-y-0.5 active:scale-[0.98] ${
              activeStatus === tile.key ? `ring-2 ${tile.ring}` : 'opacity-80 hover:opacity-100'
            }`}
          >
            <StatTile label={tile.label} value={counts[tile.key]} accentClassName={tile.accent} />
          </button>
        ) : (
          <StatTile key={tile.key} label={tile.label} value={counts[tile.key]} accentClassName={tile.accent} />
        )
      )}
    </div>
  );
}

export default LoadsStatsRow;
