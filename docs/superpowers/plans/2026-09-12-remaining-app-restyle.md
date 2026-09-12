# Remaining App Restyle (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry Phase 1's Apple-style selection-mode language to the Loads table's own bulk-select (the last place still using plain always-on checkboxes), and confirm the remaining modals already match the established design language.

**Architecture:** Same swap `ReviewQueue.jsx` got in Phase 1 — `useSelectionMode` + `SelectionCircle` + `BottomActionBar` replacing always-visible checkboxes and a plain bordered bar. No new components needed; everything here is reuse.

**Tech Stack:** No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-09-12-carrier-database-and-design-system.md`, Phase 4 section.

**Prerequisite:** Phase 1 (`docs/superpowers/plans/2026-09-12-design-system-foundation.md`) must be complete.

**Scope note:** The spec also called for "a pass over the remaining modals (`AddLoadModal`, `BlastModal`, `ContactMethodModal`)." Reading all three first (Task 2, before touching `LoadsTable`) — this plan documents that review's outcome rather than assuming changes are needed, since forcing a change where none is warranted isn't a real improvement.

---

## Task 1: Review the remaining modals for consistency

**Files:** none (review only — see outcome below)

- [ ] **Step 1: Read `AddLoadModal.jsx`, `BlastModal.jsx`, and `ContactMethodModal.jsx`**

Confirm each already uses: the shared `Card` component wrapped in `motion()` with `preset.modal.backdrop`/`preset.modal.card`, `PrimaryButton`/`SecondaryButton` for actions, and the same input/label styling (`rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text`) as every other form in the app.

**Outcome (already verified during planning):** All three already follow this pattern exactly — it's the same baseline Card/button/motion-preset language every modal in the app has used since before Phase 1 (Phase 1 added *new* patterns — selection mode, bottom sheets, translucent bars — for pieces that didn't have a good pattern yet; it didn't change the existing centered-modal pattern, which was already consistent). Per the design spec's own Phase 4 guidance ("centered modals stay for short, focused actions; bottom sheets for anything with a natural 'drill-down' feel"), none of these three is a drill-down browsing experience — `AddLoadModal` and `ContactMethodModal` are short, focused forms, and `BlastModal` is a single-purpose compose-and-send action. **No code changes are needed for these three files.** This task is a documented review, not a no-op skip.

- [ ] **Step 2: Commit the review finding**

No files changed, so there's nothing to commit for this task specifically — proceed directly to Task 2.

---

## Task 2: `LoadsTable` bulk-select → Apple-style selection mode

**Files:**
- Modify: `frontend/src/components/LoadsTable.jsx`
- Modify: `frontend/tests/components/LoadsTable.test.jsx`

Same swap `ReviewQueue.jsx` got in Phase 1's Task 8: a "Select" button reveals per-row `SelectionCircle`s and a translucent `BottomActionBar`, replacing the always-visible header/row checkboxes and the plain bordered bulk bar. The underlying `bulkUpdateLoadStatus`/`bulkSetIncludeRate`/`bulkDeleteLoads` calls are unchanged — presentation only. Unlike `ReviewQueue` (a card list), this is a `<table>` — the leading `<th>`/`<td>` column stays in the layout at all times (so columns don't shift when entering/exiting selection mode) but only renders a control when selection mode is active.

- [ ] **Step 1: Update the imports and state**

In `frontend/src/components/LoadsTable.jsx`, change:

```js
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { bulkCarrierMatches } from '../api/carrierMatches';
import { subscribe } from '../lib/liveSocket';
import { multiStopTagVariant, buildLookupMessage } from '../lib/lookupMessage';
import { buildPUSched } from '../lib/datExport';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../lib/dateInput';
import Badge from './Badge';
import Card from './Card';
import Skeleton from './Skeleton';
import DateRangeField from './DateRangeField';
```

to:

```js
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { bulkCarrierMatches } from '../api/carrierMatches';
import { subscribe } from '../lib/liveSocket';
import { multiStopTagVariant, buildLookupMessage } from '../lib/lookupMessage';
import { buildPUSched } from '../lib/datExport';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../lib/dateInput';
import { useSelectionMode } from '../lib/useSelectionMode';
import Badge from './Badge';
import BottomActionBar from './BottomActionBar';
import Card from './Card';
import Skeleton from './Skeleton';
import DateRangeField from './DateRangeField';
import SelectionCircle from './SelectionCircle';
```

Replace:

```js
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
```

with:

```js
  const selection = useSelectionMode();
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
```

- [ ] **Step 2: Wire the loads-fetch effect and bulk handlers to the hook**

Replace, inside the loads-fetching `useEffect`:

```js
          setLoads(data);
          setStatus('ready');
          setSelectedIds(new Set());
          setPuOverrides({});
```

with:

```js
          setLoads(data);
          setStatus('ready');
          selection.exit();
          setPuOverrides({});
```

Delete these two functions entirely (the hook replaces them):

```js
  function toggleSelectOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === sortedLoads.length ? new Set() : new Set(sortedLoads.map((l) => l.id))));
  }
```

Replace `handleBulkStatusChange`:

```js
  function handleBulkStatusChange(e) {
    const newStatus = e.target.value;
    if (!newStatus) return;
    setActionError(null);
    setBulkBusy(true);
    bulkUpdateLoadStatus(Array.from(selectedIds), newStatus)
      .then(() => {
        setSelectedIds(new Set());
      })
      .catch((err) => setActionError(err.message || 'Failed to update selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }
```

with:

```js
  function handleBulkStatusChange(e) {
    const newStatus = e.target.value;
    if (!newStatus) return;
    setActionError(null);
    setBulkBusy(true);
    bulkUpdateLoadStatus(Array.from(selection.selectedIds), newStatus)
      .then(() => {
        selection.exit();
      })
      .catch((err) => setActionError(err.message || 'Failed to update selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }
```

Replace `handleBulkIncludeRate`:

```js
  function handleBulkIncludeRate(e) {
    const value = e.target.value;
    if (!value) return;
    setActionError(null);
    setBulkBusy(true);
    bulkSetIncludeRate(Array.from(selectedIds), value === 'include')
      .then(() => {
        setSelectedIds(new Set());
      })
      .catch((err) => setActionError(err.message || 'Failed to update rate for selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }
```

with:

```js
  function handleBulkIncludeRate(e) {
    const value = e.target.value;
    if (!value) return;
    setActionError(null);
    setBulkBusy(true);
    bulkSetIncludeRate(Array.from(selection.selectedIds), value === 'include')
      .then(() => {
        selection.exit();
      })
      .catch((err) => setActionError(err.message || 'Failed to update rate for selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }
```

Replace `handleBulkDelete`:

```js
  function handleBulkDelete() {
    setActionError(null);
    setBulkBusy(true);
    bulkDeleteLoads(Array.from(selectedIds))
      .then(() => {
        setSelectedIds(new Set());
        setConfirmingBulkDelete(false);
      })
      .catch((err) => setActionError(err.message || 'Failed to delete selected loads.'))
      .finally(() => setBulkBusy(false));
  }
```

with:

```js
  function handleBulkDelete() {
    setActionError(null);
    setBulkBusy(true);
    bulkDeleteLoads(Array.from(selection.selectedIds))
      .then(() => {
        selection.exit();
        setConfirmingBulkDelete(false);
      })
      .catch((err) => setActionError(err.message || 'Failed to delete selected loads.'))
      .finally(() => setBulkBusy(false));
  }
```

- [ ] **Step 3: Replace the `allSelected`/`someSelected` locals and add the header "Select" control**

Replace:

```js
  const allSelected = sortedLoads.length > 0 && selectedIds.size === sortedLoads.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Loads</h2>
        <div className="flex items-center gap-2">
```

with:

```js
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text">Loads</h2>
          {sortedLoads.length > 0 && (
            selection.active ? (
              <div className="flex items-center gap-3 text-sm font-medium">
                <button type="button" onClick={() => selection.selectAll(sortedLoads.map((l) => l.id))} className="text-accent hover:underline">
                  Select All
                </button>
                <button type="button" onClick={selection.exit} className="text-text-muted hover:underline">
                  Done
                </button>
              </div>
            ) : (
              <button type="button" onClick={selection.enter} className="text-sm font-medium text-accent hover:underline">
                Select
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
```

- [ ] **Step 4: Replace the bulk-action bar**

Replace this whole block:

```jsx
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
          <span className="font-medium text-text">{selectedIds.size} selected</span>
          <select
            aria-label="Mark selected as"
            defaultValue=""
            onChange={handleBulkStatusChange}
            disabled={bulkBusy}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
          >
            <option value="" disabled>
              Mark as...
            </option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
          <select
            aria-label="Rate for selected"
            defaultValue=""
            onChange={handleBulkIncludeRate}
            disabled={bulkBusy}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
          >
            <option value="" disabled>
              Rate...
            </option>
            <option value="include">Include rate</option>
            <option value="exclude">Exclude rate</option>
          </select>
          {confirmingBulkDelete ? (
            <>
              <span className="text-xs text-error">Delete {selectedIds.size}?</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {bulkBusy ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingBulkDelete(false)}
                disabled={bulkBusy}
                className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingBulkDelete(true)}
              disabled={bulkBusy}
              className="rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg disabled:opacity-60"
            >
              Delete selected
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
            className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
          >
            Clear selection
          </button>
        </div>
      )}
```

with:

```jsx
      <BottomActionBar count={selection.selectedIds.size}>
        <select
          aria-label="Mark selected as"
          defaultValue=""
          onChange={handleBulkStatusChange}
          disabled={bulkBusy}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
        >
          <option value="" disabled>
            Mark as...
          </option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          aria-label="Rate for selected"
          defaultValue=""
          onChange={handleBulkIncludeRate}
          disabled={bulkBusy}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
        >
          <option value="" disabled>
            Rate...
          </option>
          <option value="include">Include rate</option>
          <option value="exclude">Exclude rate</option>
        </select>
        {confirmingBulkDelete ? (
          <>
            <span className="text-xs text-error">Delete {selection.selectedIds.size}?</span>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {bulkBusy ? 'Deleting...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmingBulkDelete(false)}
              disabled={bulkBusy}
              className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingBulkDelete(true)}
            disabled={bulkBusy}
            className="rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg disabled:opacity-60"
          >
            Delete selected
          </button>
        )}
        <button
          onClick={selection.clear}
          disabled={bulkBusy}
          className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
        >
          Clear selection
        </button>
      </BottomActionBar>
```

- [ ] **Step 5: Replace the header checkbox column**

Replace:

```jsx
              <th className="w-8 py-1.5 pr-2">
                <input
                  type="checkbox"
                  aria-label="Select all loads"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
```

with:

```jsx
              <th className="w-8 py-1.5 pr-2" />
```

(The header's own "Select All" is now the text button added in Step 3, above the table — not a header checkbox.)

- [ ] **Step 6: Replace the per-row checkbox**

Replace:

```jsx
                <td className="py-1.5 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${load.load_number}`}
                    checked={selectedIds.has(load.id)}
                    onChange={() => toggleSelectOne(load.id)}
                  />
                </td>
```

with:

```jsx
                <td className="py-1.5 pr-2">
                  {selection.active && (
                    <SelectionCircle
                      selected={selection.isSelected(load.id)}
                      onToggle={() => selection.toggle(load.id)}
                      ariaLabel={`Select ${load.load_number}`}
                    />
                  )}
                </td>
```

- [ ] **Step 7: Update the test file**

In `frontend/tests/components/LoadsTable.test.jsx`, the `describe('row selection and bulk actions', ...)` block's tests all currently interact with always-visible checkboxes directly. Replace that entire `describe` block:

```jsx
  describe('row selection and bulk actions', () => {
    test('checking a row shows the bulk action bar with a count of 1', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('"Select all" checks every row and the count matches', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByLabelText('Select L1001')).toBeChecked();
      expect(screen.getByLabelText('Select A2002')).toBeChecked();
    });

    test('"Select all" again clears the selection', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const selectAll = screen.getByLabelText('Select all loads');
      fireEvent.click(selectAll);
      fireEvent.click(selectAll);

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    test('"Clear selection" empties the selection and hides the bulk bar', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));
      fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    test('bulk-deleting selected loads with confirm calls bulkDeleteLoads with the selected ids', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkDeleteLoads.mockResolvedValue({ deleted: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(loadsApi.bulkDeleteLoads).toHaveBeenCalledWith([1, 2]);
      });
    });

    test('bulk-delete Cancel does not call bulkDeleteLoads', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(loadsApi.bulkDeleteLoads).not.toHaveBeenCalled();
    });

    test('shows an error when the bulk delete fails', async () => {
```

(This is a partial match ending mid-test — locate the exact remaining tests in the file: `'shows an error when the bulk delete fails'` and `'choosing a bulk status calls...'` and `'choosing a bulk rate action calls...'` stay in the file, unchanged in their bodies EXCEPT swapping `screen.getByLabelText('Select all loads')` for the new selection-mode flow. Read the file's current `describe('row selection and bulk actions', ...)` block in full before editing, and replace it with the version below, which covers the same behaviors through the new UI:)

```jsx
  describe('row selection and bulk actions', () => {
    test('no selection circle or bulk bar shows until "Select" is clicked', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
    });

    test('checking a row shows the bulk action bar with a count of 1', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('"Select All" checks every row and the count matches', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select L1001' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Select A2002' })).toHaveAttribute('aria-checked', 'true');
    });

    test('"Done" exits selection mode, hiding the circles and the bulk bar', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
    });

    test('"Clear selection" empties the selection but stays in selection mode', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));
      fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
      expect(screen.getByRole('checkbox', { name: 'Select L1001' })).toBeInTheDocument();
    });

    test('bulk-deleting selected loads with confirm calls bulkDeleteLoads with the selected ids, then exits selection mode', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkDeleteLoads.mockResolvedValue({ deleted: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(loadsApi.bulkDeleteLoads).toHaveBeenCalledWith([1, 2]);
      });
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
      });
    });

    test('bulk-delete Cancel does not call bulkDeleteLoads', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(loadsApi.bulkDeleteLoads).not.toHaveBeenCalled();
    });

    test('shows an error when the bulk delete fails', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.bulkDeleteLoads.mockRejectedValue(new Error('Bulk delete failed'));
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select L1001' }));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Bulk delete failed');
      });
    });

    test('choosing a bulk status calls bulkUpdateLoadStatus with the selected ids and status', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkUpdateLoadStatus.mockResolvedValue({ updated: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.change(screen.getByLabelText('Mark selected as'), { target: { value: 'covered' } });

      await waitFor(() => {
        expect(loadsApi.bulkUpdateLoadStatus).toHaveBeenCalledWith([1, 2], 'covered');
      });
    });

    test('choosing a bulk rate action calls bulkSetIncludeRate with the selected ids', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkSetIncludeRate.mockResolvedValue({ updated: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.change(screen.getByLabelText('Rate for selected'), { target: { value: 'exclude' } });

      await waitFor(() => {
        expect(loadsApi.bulkSetIncludeRate).toHaveBeenCalledWith([1, 2], false);
      });
    });
  });
```

(This replaces the entire `describe('row selection and bulk actions', ...)` block, end to end — including its closing `});`.)

- [ ] **Step 8: Run the test suite to verify it passes**

Run: `cd frontend && npx vitest run tests/components/LoadsTable.test.jsx`
Expected: PASS — all tests (the file's other describe blocks — sorting, PU column, carrier match badge, etc. — are untouched and unaffected).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/LoadsTable.jsx frontend/tests/components/LoadsTable.test.jsx
git commit -m "feat: replace Loads table checkbox bulk-select with Apple-style selection mode"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx jest --runInBand`
Expected: PASS except the 3 pre-existing `emailPoller.test.js` failures (confirmed unrelated to any of this work, across all four phases).

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS except the pre-existing `tests/App.test.jsx` (flaky count, 3-5 depending on run — confirmed pre-existing and untouched by any of this session's work) and `tests/components/DateRangeField.test.jsx` failures.

- [ ] **Step 3: Verify the production build succeeds**

Run: `cd frontend && npm run build`
Expected: builds successfully. Delete `dist/` afterward.

- [ ] **Step 4: Manual smoke check**

Run: `cd frontend && npm run dev`
On the Loads tab, click "Select," select a couple of loads, confirm the translucent bottom bar appears with the status/rate/delete controls, same feel as the Inquiries tab's selection mode from Phase 1. Stop the dev server (Ctrl+C).

- [ ] **Step 5: Push**

```bash
git push origin master
```

---

## Program complete

This closes out all four phases of `docs/superpowers/specs/2026-09-12-carrier-database-and-design-system.md`: the Apple-inspired design system foundation, the carrier database, the matching engine and Carrier Map, and this final consistency pass.
