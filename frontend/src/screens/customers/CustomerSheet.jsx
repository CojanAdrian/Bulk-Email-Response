import { useState } from 'react';
import Sheet, { PILL_DANGER, PILL_QUIET } from '../../ui/Sheet';
import CopyText from '../../ui/CopyText';
import { Segmented } from '../../ui/controls';
import Select from '../../components/Select';
import Skeleton from '../../components/Skeleton';
import { EQUIPMENT_OPTIONS } from '../../lib/equipmentOptions';
import { formatMoney } from '../../lib/formatMoney';
import { formatDayAgo } from '../../lib/formatDay';

const RANGES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];
const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'contract', label: 'Contract' },
  { value: 'spot', label: 'Spot' },
];
const EQUIPMENT_SELECT = [{ value: '', label: 'Any equipment' }, ...EQUIPMENT_OPTIONS.map((option) => ({ value: option.code, label: option.label, hint: option.code }))];

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function LoadLine({ load, done, onOpenLoad, onOpenCarrier, onHover }) {
  return (
    <li onPointerEnter={() => onHover(load.id)} className="-mx-3 grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-white/[0.06]">
      <div className="min-w-0">
        <button type="button" onClick={() => onOpenLoad(load.id)} className="block max-w-full truncate text-left text-[14px] font-semibold tracking-[-0.015em] hover:underline">
          {load.origin_city}, {load.origin_state}
          <span className="px-1.5 text-text/30">→</span>
          {load.dest_city}, {load.dest_state}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-text-muted">
          <CopyText value={load.load_number} label={`Copy load number ${load.load_number}`} />
          {load.equipment && <span>{load.equipment}</span>}
          {done ? load.done_at && <span>{formatDayAgo(load.done_at)}</span> : load.early_pu && <span>PU {formatDayAgo(load.early_pu)}</span>}
          {done && load.carrier_name && (
            <button type="button" onClick={() => onOpenCarrier(load.carrier_id)} className="truncate text-text hover:underline">
              {load.carrier_name}
            </button>
          )}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[14px] font-semibold tabular-nums">{formatMoney(done ? load.rate ?? load.target_pay : load.target_pay)}</p>
        {done && load.gp !== null && load.gp !== undefined && <p className="text-[11.5px] tabular-nums text-success">+{formatMoney(load.gp)}</p>}
      </div>
    </li>
  );
}

// One customer: who has hauled for them and their loads, open and done.
function CustomerSheet({ customer, filters, onFiltersChange, carriers, loads, status, onClose, onRemove, removing, removeError, onOpenCarrier, onOpenLoad, onHoverLoad }) {
  const [view, setView] = useState('carriers');
  const [confirming, setConfirming] = useState(false);
  const available = loads?.available || [];
  const done = loads?.done || [];

  return (
    <Sheet layoutId={`customer-${customer.name}`} label={customer.name} onClose={onClose} width="lg">
      <p className="caps pr-10">
        {customer.loadType === 'mixed' ? 'Contract and spot' : customer.loadType === 'contract' ? 'Contract' : customer.loadType === 'spot' ? 'Spot' : 'Customer'}
        {customer.lastActivity ? ` · active ${formatDayAgo(customer.lastActivity)}` : ''}
      </p>
      <h2 className="mt-3 text-[34px] font-bold leading-none tracking-[-0.05em]">{customer.name}</h2>

      <dl className="mt-5 grid grid-cols-3 gap-x-6 border-y border-white/[0.07] py-[18px]">
        <div>
          <dt className="caps">Loads</dt>
          <dd className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] tabular-nums">{customer.loadCount}</dd>
        </div>
        <div>
          <dt className="caps">Contract · spot</dt>
          <dd className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] tabular-nums">
            {customer.contractLoads || 0}
            <span className="text-text/30"> · </span>
            {customer.spotLoads || 0}
          </dd>
        </div>
        <div>
          <dt className="caps">Carriers used</dt>
          <dd className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] tabular-nums">{customer.carrierCount}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented label="Time range" value={filters.range} onChange={(range) => onFiltersChange({ range })} options={RANGES} />
        <Segmented label="Load type" value={filters.loadType} onChange={(loadType) => onFiltersChange({ loadType })} options={TYPES} />
        <Select ariaLabel="Equipment" value={filters.equipment} onChange={(equipment) => onFiltersChange({ equipment })} options={EQUIPMENT_SELECT} size="sm" />
      </div>

      <div className="mt-4">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'carriers', label: `Carriers${carriers ? ` ${carriers.length}` : ''}` },
            { value: 'loads', label: `Loads${loads ? ` ${available.length + done.length}` : ''}` },
          ]}
        />
      </div>

      {status === 'loading' && (
        <div className="mt-3">
          <Skeleton count={3} height="3.4rem" className="rounded-[14px]" />
        </div>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-3 text-sm text-error">
          Could not load this customer's carriers and loads.
        </p>
      )}

      {status === 'ready' && view === 'carriers' && (
        <>
          {carriers.length === 0 && <p className="mt-3 text-[13px] text-text-muted">No carrier runs in this view. Try a longer range or any equipment.</p>}
          <ul className="mt-2">
            {carriers.map((carrier) => (
              <li key={carrier.carrierId}>
                <button type="button" onClick={() => onOpenCarrier(carrier.carrierId)} className="-mx-3 block w-[calc(100%+1.5rem)] rounded-[14px] px-3 py-3 text-left transition-colors hover:bg-white/[0.06]">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">{carrier.carrierName}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-text-muted">{plural(carrier.runs, 'run')}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-text-muted">
                    {carrier.mcNumber && <span>MC {carrier.mcNumber}</span>}
                    <span>last {formatDayAgo(carrier.lastRanAt)}</span>
                    <span>avg {formatMoney(carrier.avgRate)}</span>
                    {carrier.avgGp !== null && <span className="text-success">+{formatMoney(carrier.avgGp)}</span>}
                  </span>
                  {carrier.lanes.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {carrier.lanes.slice(0, 3).map((lane) => (
                        <span key={lane.lane} className="max-w-full truncate rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-text-muted">
                          {lane.lane}
                          {lane.runs > 1 ? ` ×${lane.runs}` : ''}
                        </span>
                      ))}
                      {carrier.lanes.length > 3 && <span className="px-1 text-[11px] text-text-muted">+{carrier.lanes.length - 3} more</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {status === 'ready' && view === 'loads' && (
        <div onPointerLeave={() => onHoverLoad(null)}>
          <p className="caps mt-4">Available {available.length}</p>
          {available.length === 0 && <p className="mt-1.5 text-[13px] text-text-muted">Nothing open for them right now.</p>}
          <ul className="mt-1">
            {available.map((load) => (
              <LoadLine key={load.id} load={load} onOpenLoad={onOpenLoad} onOpenCarrier={onOpenCarrier} onHover={onHoverLoad} />
            ))}
          </ul>
          <p className="caps mt-4">Done {done.length}</p>
          {done.length === 0 && <p className="mt-1.5 text-[13px] text-text-muted">No booked or covered loads in this view.</p>}
          <ul className="mt-1">
            {done.map((load) => (
              <LoadLine key={load.id} load={load} done onOpenLoad={onOpenLoad} onOpenCarrier={onOpenCarrier} onHover={onHoverLoad} />
            ))}
          </ul>
        </div>
      )}

      {removeError && (
        <p role="alert" className="mt-3 text-sm text-error">
          {removeError}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-[13px] text-text-muted">The loads and carrier runs stay; only the name is cleared from them.</span>
            <button type="button" onClick={onRemove} disabled={removing} className="rounded-full bg-error px-5 py-3 text-[13px] font-semibold text-black disabled:opacity-60">
              {removing ? 'Removing...' : 'Remove customer'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={PILL_QUIET}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} aria-label={`Remove ${customer.name}`} className={`${PILL_DANGER} ml-auto`}>
            Remove
          </button>
        )}
      </div>
    </Sheet>
  );
}

export default CustomerSheet;
