import CityStateAutocomplete from '../../components/CityStateAutocomplete';
import StateSelect from '../../components/StateSelect';
import Select from '../../components/Select';
import { EQUIPMENT_OPTIONS } from '../../lib/equipmentOptions';

const FIELD = 'w-full rounded-xl border px-3 py-2 text-[13px] text-text';
const EQUIPMENT_SELECT = [{ value: '', label: 'Any equipment' }, ...EQUIPMENT_OPTIONS.map((option) => ({ value: option.code, label: `${option.code} — ${option.label}` }))];

export function blankLane() {
  return { originCity: '', originState: '', destCity: '', destState: '', equipment: '' };
}

export function laneFromLoad(load) {
  if (!load) return blankLane();
  return {
    originCity: load.origin_city || '',
    originState: load.origin_state || '',
    destCity: load.dest_city || '',
    destState: load.dest_state || '',
    equipment: load.equipment || '',
  };
}

export function laneIsComplete(lane) {
  return Boolean(lane.originCity.trim() && lane.originState.trim() && lane.destCity.trim() && lane.destState.trim());
}

// The origin, destination and equipment to find carriers for.
function LaneSearch({ lane, onChange, onSearch, searching, loadNumber, onClearLoad }) {
  const set = (patch) => onChange({ ...lane, ...patch });
  return (
    <form
      className="w-full space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="grid grid-cols-[1fr_92px] gap-2">
        <CityStateAutocomplete
          id="lane-origin-city"
          ariaLabel="Origin city"
          placeholder="From city"
          value={lane.originCity}
          onChange={(event) => set({ originCity: event.target.value })}
          onPlaceSelected={({ city, state }) => set({ originCity: city, originState: state })}
          className={FIELD}
          dark
        />
        <StateSelect ariaLabel="Origin state" value={lane.originState} onChange={(state) => set({ originState: state })} className={FIELD} dark />
        <CityStateAutocomplete
          id="lane-dest-city"
          ariaLabel="Destination city"
          placeholder="To city"
          value={lane.destCity}
          onChange={(event) => set({ destCity: event.target.value })}
          onPlaceSelected={({ city, state }) => set({ destCity: city, destState: state })}
          className={FIELD}
          dark
        />
        <StateSelect ariaLabel="Destination state" value={lane.destState} onChange={(state) => set({ destState: state })} className={FIELD} dark />
      </div>
      <div className="flex items-center gap-2">
        <Select ariaLabel="Equipment" value={lane.equipment} onChange={(value) => set({ equipment: value })} options={EQUIPMENT_SELECT} size="sm" className="min-w-0 flex-1" />
        <button type="submit" disabled={searching} className="shrink-0 rounded-full bg-accent px-5 py-2 text-[12.5px] font-semibold text-accent-ink transition-[scale] duration-300 ease-spring active:scale-95 disabled:opacity-60">
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>
      {loadNumber && (
        <p className="flex items-center gap-2 px-1 text-xs text-text-muted">
          For load {loadNumber}
          <button type="button" onClick={onClearLoad} className="rounded-full bg-white/10 px-2.5 py-0.5 text-text hover:bg-white/[0.18]">
            Search any lane
          </button>
        </p>
      )}
    </form>
  );
}

export default LaneSearch;
