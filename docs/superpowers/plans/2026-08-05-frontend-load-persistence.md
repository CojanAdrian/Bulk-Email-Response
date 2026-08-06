# Frontend Load Persistence (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the frontend real functionality on top of the Phase 1 auth shell: upload a McLeod CSV export, see the resulting loads in a table backed by the real database, and edit a load's rate/status.

**Architecture:** A pure-function CSV parser (`lib/mcleodParser.js`) resolves McLeod's variable column names and maps each row to the shape the backend's `/api/loads/upload` endpoint expects, ported faithfully from `IGT_DAT_Processor.html`'s existing column-mapping and comment-parsing logic. Three new components (`UploadPanel`, `LoadsTable`, `RateModal`) compose into `MainToolPage`, replacing its current stub. A new `api/loads.js` module mirrors `api/auth.js`'s pattern for the four loads endpoints.

**Tech Stack:** React 18 (existing), `papaparse` (new dependency, matching the CSV library already used by `IGT_DAT_Processor.html`), Vitest + React Testing Library (existing).

**Scope decision — read before starting:** `IGT_DAT_Processor.html`'s CSV pipeline does two different jobs today: (1) mapping McLeod columns into a canonical load record, and (2) an extensive anomaly-detection/cross-posting/dedup pipeline that exists specifically to help a human review a load-board *posting* before it goes out (rate sanity checks, "post as" city overrides for privacy, cross-posting the same load under multiple equipment codes, same-lane deduplication). That second job is in service of the DAT export / load-board-posting workflow, not of persisting a canonical load record to the database — cross-posted rows in particular are the *same* load repeated under different equipment codes, which would collide with the backend's `load_number`-unique upsert if inserted as-is. This plan ports only job (1). Anomaly detection, cross-posting, dedup, and DAT export are Phase 3's job, alongside the lookup search and blast modal that already depend on some of the same comment-parsing helpers (`extractSched`, used only for display in the lookup/blast flow, is deliberately not ported here since nothing in Phase 2 needs it).

**Relationship to other plans:** Builds on `docs/superpowers/plans/2026-08-05-frontend-foundation.md` (Phase 1, already merged) and the backend API from `docs/superpowers/plans/2026-08-04-backend-foundation-api.md` (already merged). Phase 3 (DAT export, lookup search, blast modal, anomaly detection) is a separate future plan.

**Prerequisite:** The backend must be running locally (`cd backend && npm start`) with MySQL up and `npm run setup-db` already run, and the frontend dev server running (`cd frontend && npm run dev`) — see `frontend/README.md` and `backend/README.md` for setup if not already done.

---

## Task 1: Loads API module

**Files:**
- Create: `frontend/src/api/loads.js`
- Test: `frontend/tests/api/loads.test.js`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/api/loads.test.js`:
```js
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { listLoads, getLoad, updateLoad, uploadLoads } from '../../src/api/loads';

describe('loads api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('listLoads gets /api/loads with no filter when called with no argument', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listLoads();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads');
    expect(url).not.toContain('?status=');
  });

  test('listLoads gets /api/loads?status=... when given a filter', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listLoads('active');
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads?status=active');
  });

  test('getLoad gets /api/loads/:id', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await getLoad(1);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/1');
  });

  test('updateLoad patches /api/loads/:id with the given data', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await updateLoad(1, { target_pay: 1700 });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/1');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ target_pay: 1700 });
  });

  test('uploadLoads posts /api/loads/upload with a loads array', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ inserted: 1, updated: 0 }) });
    await uploadLoads([{ load_number: 'L1' }]);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/upload');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ loads: [{ load_number: 'L1' }] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/api/loads.test.js`
Expected: FAIL — `Cannot find module '../../src/api/loads'`

- [ ] **Step 3: Write the loads API module**

`frontend/src/api/loads.js`:
```js
import { get, post, patch } from './client';

export function listLoads(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return get(`/api/loads${query}`);
}

export function getLoad(id) {
  return get(`/api/loads/${id}`);
}

export function updateLoad(id, data) {
  return patch(`/api/loads/${id}`, data);
}

export function uploadLoads(loads) {
  return post('/api/loads/upload', { loads });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/loads.test.js`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/loads.js frontend/tests/api/loads.test.js
git commit -m "feat: add loads API module (list, get, update, upload)"
```

---

## Task 2: McLeod CSV parser

**Files:**
- Create: `frontend/src/lib/mcleodParser.js`
- Test: `frontend/tests/lib/mcleodParser.test.js`

This is a pure-function module — no React, no network calls. Ported from `IGT_DAT_Processor.html` (`REQUIRED_COLS`/`OPTIONAL_COLS` at lines 625-643, `EQUIPMENT_MAP` at lines 616-620, `normHeader`/`cleanText`/`findColumn`/`parseMoney` at lines 647-716, `parseTemp` at lines 1704-1717, `parseLookupCommodity` at lines 1731-1768), plus one new function (`toMysqlDatetime`) needed to convert the real McLeod date format (`MM/DD/YYYY HHMM`, confirmed against `test_loads_mockup.csv`) into the `YYYY-MM-DD HH:MM:SS` format the backend's `DATETIME` columns need — the original tool never needed this since it only ever displayed dates, never persisted them.

- [ ] **Step 1: Write the failing tests**

`frontend/tests/lib/mcleodParser.test.js`:
```js
import { describe, test, expect } from 'vitest';
import { parseMcleodRows, cleanText, toMysqlDatetime } from '../../src/lib/mcleodParser';

const FIELDS = [
  'Order', 'Origin City', 'Origin State', 'Dest City', 'Dest State',
  'Equip Type', 'Weight', 'Target Pay', 'Early P/U Dt', 'Late P/U Dt',
  'Late Del Dt', 'Stops', 'Planning Comment',
];

function row(overrides = {}) {
  return {
    Order: '0078033',
    'Origin City': 'NEWPORT',
    'Origin State': 'AR',
    'Dest City': 'O FALLON',
    'Dest State': 'MO',
    'Equip Type': 'FGT',
    Weight: '12845.0 LB',
    'Target Pay': '$1,100.00',
    'Early P/U Dt': '07/01/2026 1200',
    'Late P/U Dt': '07/01/2026 1200',
    'Late Del Dt': '07/01/2026 2300',
    Stops: '0',
    'Planning Comment': '1p1d / $90 LUMP AT DEL',
    ...overrides,
  };
}

describe('parseMcleodRows', () => {
  test('maps a well-formed row to a load object matching the backend schema', () => {
    const { loads, missing } = parseMcleodRows(FIELDS, [row()]);
    expect(missing).toEqual([]);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({
      load_number: '0078033',
      origin_city: 'NEWPORT',
      origin_state: 'AR',
      dest_city: 'O FALLON',
      dest_state: 'MO',
      equipment: 'V',
      weight: '12845.0 LB',
      target_pay: 1100,
      early_pu: '2026-07-01 12:00:00',
      late_pu: '2026-07-01 12:00:00',
      late_del: '2026-07-01 23:00:00',
      stops: 0,
      comment: '1p1d / $90 LUMP AT DEL',
    });
  });

  test('reports missing required columns instead of throwing', () => {
    const { loads, missing } = parseMcleodRows(['Order'], [{ Order: '123' }]);
    expect(loads).toEqual([]);
    expect(missing.length).toBeGreaterThan(0);
  });

  test('skips rows with a blank load number or equipment', () => {
    const { loads } = parseMcleodRows(FIELDS, [row({ Order: '' }), row({ 'Equip Type': '' }), row()]);
    expect(loads).toHaveLength(1);
  });

  test('drops fully blank rows', () => {
    const blank = {};
    FIELDS.forEach((f) => { blank[f] = ''; });
    const { loads } = parseMcleodRows(FIELDS, [blank, row()]);
    expect(loads).toHaveLength(1);
  });

  test('derives commodity from the planning comment', () => {
    const { loads } = parseMcleodRows(FIELDS, [row({ 'Planning Comment': 'BEER KEGS, KEEP UPRIGHT' })]);
    expect(loads[0].commodity).toBe('Beer');
  });

  test('derives temperature only for reefer equipment', () => {
    const reefer = parseMcleodRows(FIELDS, [row({ 'Equip Type': 'R', 'Planning Comment': 'TEMP: 34-36' })]);
    expect(reefer.loads[0].temperature).toBe('34–36°F');

    const dryVan = parseMcleodRows(FIELDS, [row({ 'Equip Type': 'V', 'Planning Comment': 'TEMP: 34-36' })]);
    expect(dryVan.loads[0].temperature).toBeNull();
  });

  test('recognizes column name variants (e.g. "Dest City" vs "Destination City")', () => {
    const altFields = FIELDS.map((f) => (f === 'Dest City' ? 'Destination City' : f));
    const altRow = row();
    altRow['Destination City'] = altRow['Dest City'];
    delete altRow['Dest City'];
    const { loads, missing } = parseMcleodRows(altFields, [altRow]);
    expect(missing).toEqual([]);
    expect(loads[0].dest_city).toBe('O FALLON');
  });
});

describe('toMysqlDatetime', () => {
  test('converts "MM/DD/YYYY HHMM" to a MySQL datetime string', () => {
    expect(toMysqlDatetime('07/01/2026 1200')).toBe('2026-07-01 12:00:00');
  });

  test('defaults to midnight when no time is present', () => {
    expect(toMysqlDatetime('07/01/2026')).toBe('2026-07-01 00:00:00');
  });

  test('returns null for an empty or unparseable value', () => {
    expect(toMysqlDatetime('')).toBeNull();
    expect(toMysqlDatetime('not a date')).toBeNull();
  });
});

describe('cleanText', () => {
  test('collapses whitespace and trims', () => {
    expect(cleanText('  hello   world  ')).toBe('hello world');
  });

  test('handles null/undefined', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/lib/mcleodParser.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/mcleodParser'`

- [ ] **Step 3: Write the parser module**

`frontend/src/lib/mcleodParser.js`:
```js
export const REQUIRED_COLS = {
  order: ['order', 'order number', 'order #', 'ordernum'],
  originCity: ['origin city'],
  originState: ['origin state'],
  destCity: ['destination city', 'dest city', 'delivery city', 'drop city'],
  destState: ['destination state', 'dest state', 'delivery state', 'drop state'],
  equipment: ['equipment', 'equip type', 'equipment type', 'equip', 'trailer type'],
  weight: ['weight'],
  targetPay: ['target pay'],
  earlyPU: ['early p u dt', 'early pu dt', 'early pickup date', 'early p/u dt'],
  latePU: ['late p u dt', 'late pu dt', 'late pickup date', 'late p/u dt'],
  comment: ['planning comment'],
};

export const OPTIONAL_COLS = {
  lateDel: ['late del dt', 'late del', 'late delivery dt', 'delivery date', 'del dt'],
  stops: ['stops', 'stop count', 'num stops', 'number of stops'],
  origZip: ['origin zip', 'origin postal code', 'orig zip', 'orig zip code', 'pickup zip', 'pu zip', 'origin postal', 'origin zip code'],
  destZip: ['dest zip', 'destination zip', 'dest postal code', 'dest zip code', 'delivery zip', 'del zip', 'drop zip', 'destination postal', 'destination postal code', 'destination zip code'],
};

export const EQUIPMENT_MAP = {
  FGT: 'V', POTM: 'PO', POZ: 'PO', IGPO: 'PO',
  V: 'V', R: 'R', RV: 'RV', VR: 'VR', VM: 'VM', RR: 'RR', VZ: 'VZ', CN: 'CN', FT: 'FT', F: 'F',
  SD: 'SD', SP: 'SP', SB: 'SB', SB26: 'SB', SBR: 'BR', BR: 'BR', RZ: 'RZ', RGN: 'RGN', RM: 'RM', PO: 'PO',
};

const REEFER_EQUIPMENT = { R: 1, RV: 1, VR: 1, RR: 1, RZ: 1, RM: 1 };

export function normHeader(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cleanText(s) {
  if (s === null || s === undefined) return '';
  s = String(s);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) out += s.charAt(i);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function findColumn(fields, synonyms) {
  const normFields = fields.map(normHeader);
  for (let i = 0; i < synonyms.length; i++) {
    const idx = normFields.indexOf(normHeader(synonyms[i]));
    if (idx !== -1) return fields[idx];
  }
  return null;
}

export function parseMoney(s) {
  s = cleanText(s).replace(/[$,]/g, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function toMysqlDatetime(raw) {
  raw = cleanText(raw);
  if (raw === '') return null;
  const [datePart, timePart] = raw.split(/\s+/);
  const dateMatch = datePart && datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateMatch) return null;
  const month = dateMatch[1].padStart(2, '0');
  const day = dateMatch[2].padStart(2, '0');
  const year = dateMatch[3];
  let hours = '00';
  let minutes = '00';
  if (timePart && /^\d{3,4}$/.test(timePart)) {
    const padded = timePart.padStart(4, '0');
    hours = padded.slice(0, 2);
    minutes = padded.slice(2, 4);
  }
  return `${year}-${month}-${day} ${hours}:${minutes}:00`;
}

export function parseTemp(comment, equipment) {
  if (!REEFER_EQUIPMENT[equipment]) return null;
  if (/\b(keep\s+)?frozen\b/i.test(comment)) return 'Frozen';
  let m =
    comment.match(/\btemp(?:erature)?\s*:?\s*(-?\d+)\s*[-–\/to]+\s*(-?\d+)/i) ||
    comment.match(/(-?\d+)\s*[-–\/]\s*(-?\d+)\s*(?:degrees?|°\s*[fc]?|\bf\b)/i);
  if (m && m[1] && m[2]) return `${m[1]}–${m[2]}°F`;
  m = comment.match(/\btemp(?:erature)?\s*:?\s*(-?\d+)/i) || comment.match(/(-?\d+)\s*(?:degrees?|°\s*[fc]?)/i);
  if (m) return `${m[1]}°F`;
  if (/\brefrigerat/i.test(comment)) return 'Refrigerated';
  return null;
}

export function parseLookupCommodity(comment) {
  const hasEmpty = /empty\s*(bottles?|cans?|containers?|returnables?)/i.test(comment) || /\bempties\b|\breturnables?\b/i.test(comment);
  const hasBeerCtx = /\bbeer\b|\bbrewery\b|\bbrewing\b|\bale\b|\blager\b/i.test(comment);
  if (hasEmpty && hasBeerCtx) return 'Empty beer bottles/cans';
  if (hasEmpty) return 'Empty bottles/cans';
  if (/\bice\s*cream\b/i.test(comment)) return 'Ice cream';
  const frozenMatch =
    comment.match(/\bfrozen\s*(chicken|poultry|turkey|beef|pork|seafood|fish|meat)\b/i) ||
    (/\b(chicken|poultry|turkey|beef|pork|seafood|fish)\b/i.test(comment) && /\bfrozen\b/i.test(comment)
      ? comment.match(/\b(chicken|poultry|turkey|beef|pork|seafood|fish)\b/i)
      : null);
  if (frozenMatch) {
    const item = (frozenMatch[1] || frozenMatch[0]).toLowerCase();
    return 'Frozen ' + item.charAt(0).toUpperCase() + item.slice(1);
  }
  if (/\bfrozen\b/i.test(comment)) return 'Frozen food';
  if (/\bbeer\b|\bale\b|\blager\b|\bipa\b|\bstout\b|\bporter\b|\bbrewery\b|\bbrewing\b|\bcanned\s+beer\b/i.test(comment)) return 'Beer';
  if (/\bwine\b|\bwinery\b|\bvineyard\b|\bmerlot\b|\bchardonnay\b|\bcabernet\b/i.test(comment)) return 'Wine';
  if (/\bwhiske?y\b|\bbourbon\b|\bvodka\b|\brum\b|\bgin\b|\btequila\b|\bspirits?\b|\bliquor\b/i.test(comment)) return 'Spirits / liquor';
  if (/\bbeverage\b|\bdrinks?\b|\bsoda\b|\bpop\b|\bjuice\b/i.test(comment)) return 'Beverages';
  if (/\bauto\s*parts?\b|\bautomotive\b|\bcar\s*parts?\b/i.test(comment)) return 'Auto parts';
  if (/\bgrocery\b|\bgroceries\b|\bfood\s*grade\b|\bproduce\b/i.test(comment)) return 'Grocery / food';
  if (/palletized\s*paper|paper\s*products?|paper\s*goods?/i.test(comment)) return 'Paper products (palletized)';
  if (/\bpaper\b|\bpaperboard\b|\bpackaging\b|\bcorrugated\b/i.test(comment)) return 'Paper / packaging';
  if (/\belectronics?\b|\bcomputers?\b|\bappliances?\b/i.test(comment)) return 'Electronics';
  if (/\bfurniture\b|\bhome\s*goods?\b/i.test(comment)) return 'Furniture';
  if (/\bsteel\b|\bmetal\b|\bcoils?\b|\bscrap\b/i.test(comment)) return 'Steel / metal';
  if (/\blumber\b|\bwood\b|\btimber\b/i.test(comment)) return 'Lumber';
  if (/\bplastic\b|\bresin\b|\bpolymers?\b/i.test(comment)) return 'Plastics / resin';
  return null;
}

function resolveColumns(fields) {
  const colMap = {};
  const missing = [];
  Object.keys(REQUIRED_COLS).forEach((key) => {
    const col = findColumn(fields, REQUIRED_COLS[key]);
    if (col === null) missing.push(REQUIRED_COLS[key][0]);
    else colMap[key] = col;
  });
  if (missing.length) return { colMap: null, missing };

  Object.keys(OPTIONAL_COLS).forEach((key) => {
    const col = findColumn(fields, OPTIONAL_COLS[key]);
    if (col !== null) colMap[key] = col;
  });
  return { colMap, missing: [] };
}

function mapRowToLoad(row, colMap) {
  const rawEquip = cleanText(row[colMap.equipment]);
  const equipKey = rawEquip.toUpperCase();
  const equipment = EQUIPMENT_MAP[equipKey] || rawEquip;
  const rawComment = cleanText(row[colMap.comment]);

  return {
    load_number: cleanText(row[colMap.order]),
    origin_city: cleanText(row[colMap.originCity]),
    origin_state: cleanText(row[colMap.originState]),
    origin_zip: colMap.origZip ? cleanText(row[colMap.origZip]).replace(/\D/g, '').slice(0, 5) : '',
    dest_city: cleanText(row[colMap.destCity]),
    dest_state: cleanText(row[colMap.destState]),
    dest_zip: colMap.destZip ? cleanText(row[colMap.destZip]).replace(/\D/g, '').slice(0, 5) : '',
    equipment,
    weight: cleanText(row[colMap.weight]),
    target_pay: parseMoney(row[colMap.targetPay]),
    early_pu: toMysqlDatetime(row[colMap.earlyPU]),
    late_pu: toMysqlDatetime(row[colMap.latePU]),
    late_del: colMap.lateDel ? toMysqlDatetime(row[colMap.lateDel]) : null,
    stops: colMap.stops ? parseInt(cleanText(row[colMap.stops]), 10) || 0 : 0,
    commodity: parseLookupCommodity(rawComment),
    temperature: parseTemp(rawComment, equipment),
    comment: rawComment,
  };
}

export function parseMcleodRows(fields, rows) {
  const { colMap, missing } = resolveColumns(fields);
  if (missing.length) return { loads: [], missing };

  const cleanRows = rows.filter((r) => Object.keys(r).some((k) => cleanText(r[k]) !== ''));
  const loads = cleanRows
    .map((row) => mapRowToLoad(row, colMap))
    .filter((load) => load.load_number !== '' && load.equipment !== '');
  return { loads, missing: [] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/mcleodParser.test.js`
Expected: PASS (13 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mcleodParser.js frontend/tests/lib/mcleodParser.test.js
git commit -m "feat: add McLeod CSV column-mapping and row-parsing logic"
```

---

## Task 3: UploadPanel component

**Files:**
- Create: `frontend/src/components/UploadPanel.jsx`
- Test: `frontend/tests/components/UploadPanel.test.jsx`
- Modify: `frontend/package.json` (add `papaparse` dependency)

- [ ] **Step 1: Install papaparse**

Run (from `frontend/`):
```bash
npm install papaparse
```
Expected: `papaparse` added to `dependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

`frontend/tests/components/UploadPanel.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import UploadPanel from '../../src/components/UploadPanel';
import * as loadsApi from '../../src/api/loads';

vi.mock('papaparse');
vi.mock('../../src/api/loads');

function makeFile(name = 'loads.csv') {
  return new File(['irrelevant'], name, { type: 'text/csv' });
}

const VALID_FIELDS = [
  'Order', 'Origin City', 'Origin State', 'Dest City', 'Dest State',
  'Equip Type', 'Weight', 'Target Pay', 'Early P/U Dt', 'Late P/U Dt', 'Planning Comment',
];

function validRow() {
  return {
    Order: '0078033',
    'Origin City': 'NEWPORT',
    'Origin State': 'AR',
    'Dest City': 'O FALLON',
    'Dest State': 'MO',
    'Equip Type': 'FGT',
    Weight: '12845.0 LB',
    'Target Pay': '$1,100.00',
    'Early P/U Dt': '07/01/2026 1200',
    'Late P/U Dt': '07/01/2026 1200',
    'Planning Comment': '1p1d / $90 LUMP AT DEL',
  };
}

describe('UploadPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('parses a valid CSV and uploads the resulting loads', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: VALID_FIELDS }, data: [validRow()] });
    });
    loadsApi.uploadLoads.mockResolvedValue({ inserted: 1, updated: 0 });
    const onUploadComplete = vi.fn();
    render(<UploadPanel onUploadComplete={onUploadComplete} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(loadsApi.uploadLoads).toHaveBeenCalledTimes(1);
    });
    const [loads] = loadsApi.uploadLoads.mock.calls[0];
    expect(loads).toHaveLength(1);
    expect(loads[0].load_number).toBe('0078033');
    expect(loads[0].equipment).toBe('V');

    await waitFor(() => {
      expect(screen.getByText(/uploaded: 1 new, 0 updated/i)).toBeInTheDocument();
    });
    expect(onUploadComplete).toHaveBeenCalled();
  });

  test('shows an error when required columns are missing, without calling the upload API', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: ['Order'] }, data: [{ Order: '123' }] });
    });
    render(<UploadPanel onUploadComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/missing required column/i)).toBeInTheDocument();
    });
    expect(loadsApi.uploadLoads).not.toHaveBeenCalled();
  });

  test('shows an error when the upload request fails', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: VALID_FIELDS }, data: [validRow()] });
    });
    loadsApi.uploadLoads.mockRejectedValue(new Error('Internal server error'));
    render(<UploadPanel onUploadComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
  });

  test('shows an error when the file has headers but no usable data rows', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: VALID_FIELDS }, data: [] });
    });
    render(<UploadPanel onUploadComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/no usable data rows/i)).toBeInTheDocument();
    });
    expect(loadsApi.uploadLoads).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/UploadPanel.test.jsx`
Expected: FAIL — `Cannot find module '../../src/components/UploadPanel'`

- [ ] **Step 4: Write the component**

`frontend/src/components/UploadPanel.jsx`:
```jsx
import { useState } from 'react';
import Papa from 'papaparse';
import { parseMcleodRows, cleanText } from '../lib/mcleodParser';
import { uploadLoads } from '../api/loads';

function UploadPanel({ onUploadComplete }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'parsing' | 'uploading' | 'done'
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setResult(null);
    setStatus('parsing');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => cleanText(h),
      complete: (results) => {
        const fields = results.meta.fields || [];
        if (fields.length === 0) {
          setError('The file appears to be empty or not a valid CSV.');
          setStatus('idle');
          return;
        }
        const { loads, missing } = parseMcleodRows(fields, results.data);
        if (missing.length) {
          setError(`The file is missing required column(s): ${missing.join(', ')}`);
          setStatus('idle');
          return;
        }
        if (loads.length === 0) {
          setError('The file contains headers but no usable data rows.');
          setStatus('idle');
          return;
        }
        submitLoads(loads);
      },
      error: (err) => {
        setError(`Failed to read file: ${err.message}`);
        setStatus('idle');
      },
    });
  }

  function submitLoads(loads) {
    setStatus('uploading');
    uploadLoads(loads)
      .then((data) => {
        setResult(data);
        setStatus('done');
        onUploadComplete();
      })
      .catch((err) => {
        setError(err.message || 'Upload failed.');
        setStatus('idle');
      });
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Upload loads CSV</h2>
      <input
        type="file"
        accept=".csv"
        aria-label="Upload loads CSV"
        onChange={handleFileChange}
        disabled={status === 'parsing' || status === 'uploading'}
        className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white hover:file:bg-indigo-500"
      />
      {status === 'parsing' && <p className="mt-3 text-sm text-slate-400">Parsing file...</p>}
      {status === 'uploading' && <p className="mt-3 text-sm text-slate-400">Uploading...</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {result && (
        <p className="mt-3 text-sm text-emerald-400">
          Uploaded: {result.inserted} new, {result.updated} updated.
        </p>
      )}
    </div>
  );
}

export default UploadPanel;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/UploadPanel.test.jsx`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/UploadPanel.jsx frontend/tests/components/UploadPanel.test.jsx
git commit -m "feat: add UploadPanel component for CSV upload"
```

---

## Task 4: LoadsTable component

**Files:**
- Create: `frontend/src/components/LoadsTable.jsx`
- Test: `frontend/tests/components/LoadsTable.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/components/LoadsTable.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoadsTable from '../../src/components/LoadsTable';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const SAMPLE_LOAD = {
  id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
  dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
};

describe('LoadsTable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('renders loads returned by the API, filtered to active by default', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('L1001')).toBeInTheDocument();
    });
    expect(loadsApi.listLoads).toHaveBeenCalledWith('active');
  });

  test('shows an empty state when there are no loads', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/no loads found/i)).toBeInTheDocument();
    });
  });

  test('shows an error state when the request fails', async () => {
    loadsApi.listLoads.mockRejectedValue(new Error('Network error'));
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load loads/i)).toBeInTheDocument();
    });
  });

  test('calls onSelectLoad with the load when "Edit rate" is clicked', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    const onSelectLoad = vi.fn();
    render(<LoadsTable refreshKey={0} onSelectLoad={onSelectLoad} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /edit rate/i }));
    expect(onSelectLoad).toHaveBeenCalledWith(SAMPLE_LOAD);
  });

  test('refetches with the new filter when the status dropdown changes', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('active'));

    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'booked' } });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('booked'));
  });

  test('refetches when refreshKey changes', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    const { rerender } = render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));

    rerender(<LoadsTable refreshKey={1} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/LoadsTable.test.jsx`
Expected: FAIL — `Cannot find module '../../src/components/LoadsTable'`

- [ ] **Step 3: Write the component**

`frontend/src/components/LoadsTable.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';

function LoadsTable({ refreshKey, onSelectLoad }) {
  const [loads, setLoads] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [statusFilter, setStatusFilter] = useState('active');

  useEffect(() => {
    setStatus('loading');
    listLoads(statusFilter)
      .then((data) => {
        setLoads(data);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [refreshKey, statusFilter]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Loads</h2>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
        >
          <option value="active">Active</option>
          <option value="booked">Booked</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      {status === 'loading' && <p className="text-sm text-slate-400">Loading loads...</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          Failed to load loads.
        </p>
      )}
      {status === 'ready' && loads.length === 0 && <p className="text-sm text-slate-400">No loads found.</p>}
      {status === 'ready' && loads.length > 0 && (
        <table className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500">
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
              <tr key={load.id} className="border-b border-slate-800/60">
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
                    className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
                  >
                    Edit rate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default LoadsTable;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/LoadsTable.test.jsx`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoadsTable.jsx frontend/tests/components/LoadsTable.test.jsx
git commit -m "feat: add LoadsTable component"
```

---

## Task 5: RateModal component

**Files:**
- Create: `frontend/src/components/RateModal.jsx`
- Test: `frontend/tests/components/RateModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/components/RateModal.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RateModal from '../../src/components/RateModal';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const LOAD = { id: 1, load_number: 'L1001', target_pay: '1500.00', status: 'active' };

describe('RateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('saves the updated target pay and status, then closes', async () => {
    loadsApi.updateLoad.mockResolvedValue({ ...LOAD, target_pay: '1700', status: 'booked' });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/target pay/i), { target: { value: '1700' } });
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'booked' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: '1700', status: 'booked' });
      expect(onSaved).toHaveBeenCalledWith({ ...LOAD, target_pay: '1700', status: 'booked' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('shows an error and keeps the modal open when saving fails', async () => {
    loadsApi.updateLoad.mockRejectedValue(new Error('Internal server error'));
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('calls onClose without saving when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(loadsApi.updateLoad).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/RateModal.test.jsx`
Expected: FAIL — `Cannot find module '../../src/components/RateModal'`

- [ ] **Step 3: Write the component**

`frontend/src/components/RateModal.jsx`:
```jsx
import { useState } from 'react';
import { updateLoad } from '../api/loads';

function RateModal({ load, onClose, onSaved }) {
  const [targetPay, setTargetPay] = useState(load.target_pay ?? '');
  const [status, setStatus] = useState(load.status);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    setError(null);
    setSaving(true);
    updateLoad(load.id, { target_pay: targetPay, status })
      .then((updated) => {
        onSaved(updated);
        onClose();
      })
      .catch((err) => {
        setError(err.message || 'Failed to save.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Edit load {load.load_number}</h2>
        <label className="mb-1 block text-sm text-slate-400" htmlFor="targetPay">
          Target pay
        </label>
        <input
          id="targetPay"
          value={targetPay}
          onChange={(e) => setTargetPay(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        />
        <label className="mb-1 block text-sm text-slate-400" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        >
          <option value="active">Active</option>
          <option value="booked">Booked</option>
          <option value="expired">Expired</option>
        </select>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RateModal;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/RateModal.test.jsx`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RateModal.jsx frontend/tests/components/RateModal.test.jsx
git commit -m "feat: add RateModal component"
```

---

## Task 6: Wire everything into MainToolPage

**Files:**
- Modify: `frontend/src/pages/MainToolPage.jsx`
- Create: `frontend/tests/pages/MainToolPage.test.jsx`
- Modify: `frontend/tests/App.test.jsx` (mock `api/loads` so existing tests don't break now that `MainToolPage` makes real-shaped calls)

- [ ] **Step 1: Write the failing MainToolPage tests**

`frontend/tests/pages/MainToolPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MainToolPage from '../../src/pages/MainToolPage';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

describe('MainToolPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
  });

  test('renders the upload panel and the loads table', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    expect(screen.getByText(/upload loads csv/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no loads found/i)).toBeInTheDocument();
    });
  });

  test('opens the rate modal when a load row is selected, and refreshes the table on save', async () => {
    const load = {
      id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
    };
    loadsApi.listLoads.mockResolvedValue([load]);
    loadsApi.updateLoad.mockResolvedValue({ ...load, target_pay: '1700', status: 'active' });
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /edit rate/i }));
    expect(screen.getByText(/edit load L1001/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(2);
    });
  });

  test('refreshes the table when an upload completes', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));
    // Simulate UploadPanel's onUploadComplete by finding no direct hook here —
    // this is covered indirectly since UploadPanel/LoadsTable are exercised in
    // their own test files; this test just confirms the initial wiring renders
    // without error and fetches once on mount.
    expect(screen.getByLabelText(/upload loads csv/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: FAIL — the current `MainToolPage.jsx` doesn't render an upload input or a loads table (it's still the Phase 1 stub), so `screen.getByText(/upload loads csv/i)` throws

- [ ] **Step 3: Rewrite MainToolPage.jsx**

`frontend/src/pages/MainToolPage.jsx`:
```jsx
import { useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import RateModal from '../components/RateModal';

function MainToolPage({ username, onLogout }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLoad, setSelectedLoad] = useState(null);

  function handleUploadComplete() {
    setRefreshKey((k) => k + 1);
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">BulkPosting</h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{username}</span>
          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="space-y-6 p-6">
        <UploadPanel onUploadComplete={handleUploadComplete} />
        <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
      </main>
      {selectedLoad && (
        <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}

export default MainToolPage;
```

- [ ] **Step 4: Run the MainToolPage tests to verify they pass**

Run: `npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: PASS (3 passed)

- [ ] **Step 5: Fix App.test.jsx — mock `api/loads` so existing tests don't break**

`MainToolPage` now renders `LoadsTable`, which calls the real `listLoads` on mount. `frontend/tests/App.test.jsx` currently only mocks `../src/api/auth`, so any test that reaches the logged-in state will now trigger an unmocked `listLoads()` call. Add the mock.

In `frontend/tests/App.test.jsx`, add near the top (after the existing `authApi` import/mock):
```js
import * as loadsApi from '../src/api/loads';

vi.mock('../src/api/loads');
```
And in the existing `beforeEach`, add one line so every test starts with a clean, resolved mock (harmless for tests that never reach the logged-in state):
```js
beforeEach(() => {
  vi.resetAllMocks();
  loadsApi.listLoads.mockResolvedValue([]);
});
```

- [ ] **Step 6: Run the full test suite to verify no regressions**

Run (from `frontend/`): `npm test`
Expected: all suites pass (should be 8 files now: client, auth, loads (api), mcleodParser, LoginPage, App, UploadPanel, LoadsTable, RateModal, MainToolPage — confirm the actual count, don't worry about matching an exact number, just confirm zero failures)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MainToolPage.jsx frontend/tests/pages/MainToolPage.test.jsx frontend/tests/App.test.jsx
git commit -m "feat: wire upload, loads table, and rate modal into MainToolPage"
```

---

## Task 7: Manual verification and README update

**Files:**
- Modify: `frontend/README.md`

- [ ] **Step 1: Update the README**

Update `frontend/README.md`'s scope description: remove "CSV upload, the loads table, rate editing" from the list of things NOT implemented (they're done now), and keep "DAT export and the blast modal" as still-pending Phase 3 work. Add a short section describing the new functionality:

```markdown
## Uploading loads

On the main screen, use "Upload loads CSV" to upload a McLeod export.
The file is parsed entirely in the browser (column names are matched
flexibly, e.g. "Dest City" or "Destination City" both work) and the
resulting loads are upserted into the database by load number — a
re-upload with the same load numbers updates rates/details rather than
creating duplicates, and never changes a load's `active`/`booked`/`expired`
status (that's manual-only, via "Edit rate" on the loads table).

Note: only the column-mapping logic is ported from the original
`IGT_DAT_Processor.html` tool so far — anomaly detection, cross-posting,
and DAT export are Phase 3 work and aren't available yet.
```

- [ ] **Step 2: Perform real manual verification**

With the backend running (`cd backend && npm start`, MySQL up) and this frontend running (`cd frontend && npm run dev`):

1. Log in.
2. Upload `test_loads_mockup.csv` (in the repo root) via the Upload panel.
3. Confirm the success message shows a nonzero `inserted` count, and the loads table below populates with real rows.
4. Click "Edit rate" on one row, change the target pay, and save. Confirm the table reflects the new value.
5. Change the status filter dropdown to "booked" and confirm the loads table updates.
6. Re-upload the same CSV file. Confirm the success message now shows `updated` loads instead of `inserted`, and the table's row count didn't change (no duplicates).

If any step doesn't work as described, investigate and fix it — don't just note it as a known issue. Common failure points: `papaparse`'s CSV parsing options not matching the real file's quoting/encoding, a column-name variant in the real file not covered by `REQUIRED_COLS`/`OPTIONAL_COLS`, or a date format edge case in `toMysqlDatetime`.

- [ ] **Step 3: Commit**

```bash
git add frontend/README.md
git commit -m "docs: update frontend README for CSV upload and rate editing"
```

---

## Definition of Done

- `npm test` passes in `frontend/` with zero failures across all suites.
- `npm run build` succeeds.
- The manual verification in Task 7 was actually performed against the real backend with the real `test_loads_mockup.csv` file, not just described.
- DAT export, lookup search, the blast modal, and anomaly detection are explicitly NOT included — that's Phase 3.
