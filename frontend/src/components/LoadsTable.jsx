import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import Card from './Card';
import Skeleton from './Skeleton';

function LoadsTable({ refreshKey, onSelectLoad }) {
  const [loads, setLoads] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [statusFilter, setStatusFilter] = useState('active');
  const [error, setError] = useState(null);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    setStatus('loading');
    setError(null);
    listLoads(statusFilter)
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load loads.');
          setStatus('error');
        }
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, statusFilter, liveTick]);

  useEffect(() => {
    return subscribe('load:changed', () => setLiveTick((t) => t + 1));
  }, []);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Loads</h2>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-sm text-text"
        >
          <option value="active">Active</option>
          <option value="booked">Booked</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      {status === 'loading' && <Skeleton count={4} height="1.75rem" />}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && loads.length === 0 && <p className="text-sm text-text-muted">No loads found.</p>}
      {status === 'ready' && loads.length > 0 && (
        <table className="w-full text-left text-sm text-text">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4">Load #</th>
              <th className="py-2 pr-4">Origin</th>
              <th className="py-2 pr-4">Destination</th>
              <th className="py-2 pr-4">Equipment</th>
              <th className="py-2 pr-4">Target Pay</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={load.id} className="border-b border-border/60">
                <td className="py-2 pr-4">{load.load_number}</td>
                <td className="py-2 pr-4">
                  {load.origin_city}, {load.origin_state}
                </td>
                <td className="py-2 pr-4">
                  {load.dest_city}, {load.dest_state}
                </td>
                <td className="py-2 pr-4">{load.equipment}</td>
                <td className="py-2 pr-4">{load.target_pay}</td>
                <td className="py-2 pr-4">{load.status}</td>
                <td className="py-2">
                  <button
                    onClick={() => onSelectLoad(load)}
                    className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface-alt"
                  >
                    Edit rate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default LoadsTable;
