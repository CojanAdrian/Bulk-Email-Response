# Design System Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Apple/iOS-inspired interaction primitives (selection mode, bottom sheet, translucent action bar, spring motion presets, deliberate font stack) and prove them out by replacing the Review queue's plain-checkbox bulk-select — the piece the user explicitly said "looks cheap."

**Architecture:** Four new small, independently-testable pieces (`useSelectionMode` hook, `SelectionCircle`, `BottomActionBar`, `BottomSheet` components) extend the existing token/motion system in `frontend/src/styles/tokens.css` and `frontend/src/lib/motionConfig.js` — no existing tokens change, no other screen is touched yet. `ReviewQueue.jsx`'s existing bulk-select (checkboxes + a plain bordered bar, added in the prior bug-fix pass) is swapped to use them, behavior-preserving: the same `bulkSendInquiries`/`bulkRejectInquiries` calls and state logic stay, only presentation changes.

**Tech Stack:** React 18, `framer-motion` ^13, Tailwind CSS ^3.4, Vitest + Testing Library (existing stack, no new dependencies in this phase — `react-globe.gl` etc. come in Phase 3).

**Source spec:** `docs/superpowers/specs/2026-09-12-carrier-database-and-design-system.md`, Phase 1 section.

---

## Task 1: Motion presets — `sheet` and `selectionPop`

**Files:**
- Modify: `frontend/src/lib/motionConfig.js`
- Test: `frontend/tests/lib/motionConfig.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `frontend/tests/lib/motionConfig.test.js`, inside the existing `describe('useMotionPreset', ...)` block (after the last existing `test(...)`, before the closing `});`):

```js
  test('the sheet preset gives the panel a spring entrance from below and a plain fade for the backdrop, when motion is not reduced', () => {
    useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.sheet.panel.initial).toEqual({ y: '100%' });
    expect(result.current.sheet.panel.animate).toEqual({ y: 0 });
    expect(result.current.sheet.panel.transition.type).toBe('spring');
    expect(result.current.sheet.backdrop.transition.type).not.toBe('spring');
  });

  test('the sheet preset collapses to an instant fade when motion is reduced', () => {
    useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.sheet.panel.transition.type).not.toBe('spring');
    expect(result.current.sheet.panel.transition.duration).toBeLessThanOrEqual(0.05);
  });

  test('the selectionPop preset springs a circle in from scale 0, when motion is not reduced', () => {
    useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.selectionPop.initial).toEqual({ scale: 0 });
    expect(result.current.selectionPop.animate).toEqual({ scale: 1 });
    expect(result.current.selectionPop.transition.type).toBe('spring');
  });

  test('the selectionPop preset skips the scale animation when motion is reduced', () => {
    useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.selectionPop.initial).toEqual({ scale: 1 });
    expect(result.current.selectionPop.transition.type).not.toBe('spring');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/motionConfig.test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'panel')` (or similar) on the new tests, since `sheet`/`selectionPop` don't exist on either preset yet. The 3 pre-existing tests still pass.

- [ ] **Step 3: Add the presets**

In `frontend/src/lib/motionConfig.js`, add to `REDUCED_PRESET` (after the existing `banner:` block, before `stagger: 0,`):

```js
  sheet: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: INSTANT_TRANSITION,
    },
    panel: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: INSTANT_TRANSITION },
      transition: INSTANT_TRANSITION,
    },
  },
  selectionPop: {
    initial: { scale: 1 },
    animate: { scale: 1 },
    transition: INSTANT_TRANSITION,
  },
```

Add to `FULL_PRESET` (after the existing `banner:` block, before `stagger: 0.04,`):

```js
  // A modal variant that slides up from the bottom instead of popping in
  // centered (see `modal` above) -- for content that reads as a "drill
  // into detail" rather than a short, focused action (BottomSheet.jsx).
  sheet: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    },
    panel: {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%', transition: { duration: 0.2 } },
      transition: { type: 'spring', stiffness: 350, damping: 35 },
    },
  },
  // The checkmark circle's fill animation in selection mode -- a slight
  // overshoot (low damping relative to stiffness) so it reads as a native
  // iOS "pop," not a linear checkbox tick.
  selectionPop: {
    initial: { scale: 0 },
    animate: { scale: 1 },
    transition: { type: 'spring', stiffness: 500, damping: 22 },
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/lib/motionConfig.test.js`
Expected: PASS — all 7 tests (3 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/motionConfig.js frontend/tests/lib/motionConfig.test.js
git commit -m "feat: add sheet and selectionPop motion presets"
```

---

## Task 2: `CheckIcon`

**Files:**
- Modify: `frontend/src/components/icons.jsx`

No dedicated test file exists for `icons.jsx` today (icons aren't tested standalone in this codebase — verified via `SelectionCircle`'s test in Task 3, which renders this icon as part of its own assertions). This step has no test-first cycle of its own.

- [ ] **Step 1: Add the icon**

Append to `frontend/src/components/icons.jsx` (after the existing `GoogleIcon` function, end of file):

```jsx

export function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/icons.jsx
git commit -m "feat: add CheckIcon"
```

---

## Task 3: `SelectionCircle` component

**Files:**
- Create: `frontend/src/components/SelectionCircle.jsx`
- Test: `frontend/tests/components/SelectionCircle.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/SelectionCircle.test.jsx`:

```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectionCircle from '../../src/components/SelectionCircle';

describe('SelectionCircle', () => {
  test('renders as an unchecked checkbox-role button with the given label', () => {
    render(<SelectionCircle selected={false} onToggle={vi.fn()} ariaLabel="Select inquiry from a@example.com" />);
    const el = screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' });
    expect(el).toHaveAttribute('aria-checked', 'false');
  });

  test('marks aria-checked true and shows a checkmark icon when selected', () => {
    render(<SelectionCircle selected onToggle={vi.fn()} ariaLabel="Select inquiry from a@example.com" />);
    const el = screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' });
    expect(el).toHaveAttribute('aria-checked', 'true');
    expect(el.querySelector('svg')).not.toBeNull();
  });

  test('renders no checkmark icon when not selected', () => {
    render(<SelectionCircle selected={false} onToggle={vi.fn()} ariaLabel="Select inquiry from a@example.com" />);
    const el = screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' });
    expect(el.querySelector('svg')).toBeNull();
  });

  test('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<SelectionCircle selected={false} onToggle={onToggle} ariaLabel="Select inquiry from a@example.com" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('applies the accent-filled classes only when selected', () => {
    const { rerender } = render(<SelectionCircle selected={false} onToggle={vi.fn()} ariaLabel="label" />);
    expect(screen.getByRole('checkbox').className).not.toContain('bg-accent');

    rerender(<SelectionCircle selected onToggle={vi.fn()} ariaLabel="label" />);
    expect(screen.getByRole('checkbox').className).toContain('bg-accent');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/components/SelectionCircle.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/SelectionCircle` (module doesn't exist yet).

- [ ] **Step 3: Write the component**

Create `frontend/src/components/SelectionCircle.jsx`:

```jsx
import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';
import { CheckIcon } from './icons';

// The leading tap target in selection mode -- an empty ring that fills
// with a checkmark and springs into place when selected (see
// motionConfig.js's `selectionPop` preset), replacing a plain HTML
// checkbox with something that reads as native/iOS rather than a form
// control. Same selected/onToggle/ariaLabel interface a checkbox
// <input>'s checked/onChange/aria-label had, so it drops into existing
// list rows without changing the surrounding selection-state logic.
function SelectionCircle({ selected, onToggle, ariaLabel }) {
  const preset = useMotionPreset();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        selected ? 'border-accent bg-accent' : 'border-border bg-transparent'
      }`}
    >
      {selected && (
        <motion.span
          initial={preset.selectionPop.initial}
          animate={preset.selectionPop.animate}
          transition={preset.selectionPop.transition}
          className="flex items-center justify-center"
        >
          <CheckIcon className="h-3.5 w-3.5 text-accent-ink" />
        </motion.span>
      )}
    </button>
  );
}

export default SelectionCircle;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/SelectionCircle.test.jsx`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SelectionCircle.jsx frontend/tests/components/SelectionCircle.test.jsx
git commit -m "feat: add SelectionCircle component"
```

---

## Task 4: `useSelectionMode` hook

**Files:**
- Create: `frontend/src/lib/useSelectionMode.js`
- Test: `frontend/tests/lib/useSelectionMode.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/lib/useSelectionMode.test.js`:

```js
import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionMode } from '../../src/lib/useSelectionMode';

describe('useSelectionMode', () => {
  test('starts inactive with no selected ids', () => {
    const { result } = renderHook(() => useSelectionMode());
    expect(result.current.active).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  test('enter() activates selection mode without selecting anything', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    expect(result.current.active).toBe(true);
    expect(result.current.selectedIds.size).toBe(0);
  });

  test('toggle() adds an id, toggling again removes it', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.toggle(1));
    expect(result.current.isSelected(1)).toBe(true);
    act(() => result.current.toggle(1));
    expect(result.current.isSelected(1)).toBe(false);
  });

  test('selectAll() selects every given id when none are fully selected yet', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.selectAll([1, 2, 3]));
    expect(result.current.selectedIds).toEqual(new Set([1, 2, 3]));
  });

  test('selectAll() clears the selection when every given id is already selected', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.selectAll([1, 2, 3]));
    act(() => result.current.selectAll([1, 2, 3]));
    expect(result.current.selectedIds.size).toBe(0);
  });

  test('remove() drops one id without touching the rest or exiting selection mode', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    act(() => result.current.selectAll([1, 2, 3]));
    act(() => result.current.remove(2));
    expect(result.current.selectedIds).toEqual(new Set([1, 3]));
    expect(result.current.active).toBe(true);
  });

  test('clear() empties the selection but stays active', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    act(() => result.current.selectAll([1, 2]));
    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.active).toBe(true);
  });

  test('exit() empties the selection and deactivates', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    act(() => result.current.selectAll([1, 2]));
    act(() => result.current.exit());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.active).toBe(false);
  });

  test('isSelected() reflects current membership', () => {
    const { result } = renderHook(() => useSelectionMode());
    expect(result.current.isSelected(5)).toBe(false);
    act(() => result.current.toggle(5));
    expect(result.current.isSelected(5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/lib/useSelectionMode.test.js`
Expected: FAIL — cannot resolve `../../src/lib/useSelectionMode`.

- [ ] **Step 3: Write the hook**

Create `frontend/src/lib/useSelectionMode.js`:

```js
import { useCallback, useState } from 'react';

// Selection-mode state for a list: hidden by default (no leading circles,
// no bulk bar) until the user explicitly enters it via a "Select" button --
// mirrors the iOS Mail/Photos pattern, where selection UI only appears on
// request rather than always-on checkboxes.
export function useSelectionMode() {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const enter = useCallback(() => {
    setActive(true);
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setSelectedIds(new Set());
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Selects every id in `ids`, unless all of them are already selected --
  // in which case it clears the selection instead (a "Select All" toggle).
  const selectAll = useCallback((ids) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const remove = useCallback((id) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  return { active, selectedIds, enter, exit, clear, toggle, selectAll, remove, isSelected };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/lib/useSelectionMode.test.js`
Expected: PASS — all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useSelectionMode.js frontend/tests/lib/useSelectionMode.test.js
git commit -m "feat: add useSelectionMode hook"
```

---

## Task 5: `BottomActionBar` component

**Files:**
- Create: `frontend/src/components/BottomActionBar.jsx`
- Test: `frontend/tests/components/BottomActionBar.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/BottomActionBar.test.jsx`:

```jsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomActionBar from '../../src/components/BottomActionBar';

describe('BottomActionBar', () => {
  test('renders nothing when count is 0', () => {
    render(<BottomActionBar count={0}>content</BottomActionBar>);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  test('renders the count label and children when count is greater than 0', () => {
    render(<BottomActionBar count={3}><button>Send</button></BottomActionBar>);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  test('is translucent/blurred (reads as a floating sheet, not a plain bordered box)', () => {
    render(<BottomActionBar count={1}>content</BottomActionBar>);
    expect(screen.getByText('1 selected').closest('div').className).toContain('backdrop-blur');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/components/BottomActionBar.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/BottomActionBar`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/BottomActionBar.jsx`:

```jsx
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

// A translucent, blurred bar that slides up from the bottom of its
// container when there's an active selection -- replaces a plain bordered
// bulk-action `<div>` with something that reads as an iOS action sheet
// rather than a form toolbar. `children` is left screen-specific (the
// actual buttons a given list needs) rather than over-abstracted here.
function BottomActionBar({ count, children }) {
  const preset = useMotionPreset();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={preset.sheet.panel.initial}
          animate={preset.sheet.panel.animate}
          exit={preset.sheet.panel.exit}
          transition={preset.sheet.panel.transition}
          className="sticky bottom-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/85 px-4 py-3 text-sm shadow-[0_12px_40px_rgba(10,11,16,0.18)] backdrop-blur-xl"
        >
          <span className="font-medium text-text">{count} selected</span>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BottomActionBar;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/BottomActionBar.test.jsx`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BottomActionBar.jsx frontend/tests/components/BottomActionBar.test.jsx
git commit -m "feat: add BottomActionBar component"
```

---

## Task 6: `BottomSheet` component

**Files:**
- Create: `frontend/src/components/BottomSheet.jsx`
- Test: `frontend/tests/components/BottomSheet.test.jsx`

Not consumed anywhere yet in this phase (Phase 3's carrier detail view will be its first real user) — built now per the spec's Phase 1 scope, alongside its sibling components, so it's available when Phase 3 needs it.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/BottomSheet.test.jsx`:

```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../../src/components/BottomSheet';

describe('BottomSheet', () => {
  test('renders its children inside a dialog', () => {
    render(<BottomSheet onClose={vi.fn()}>Sheet content</BottomSheet>);
    expect(screen.getByRole('dialog')).toHaveTextContent('Sheet content');
  });

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose}>content</BottomSheet>);
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not call onClose when the panel itself is clicked', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose}>content</BottomSheet>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('renders a drag-handle indicator', () => {
    render(<BottomSheet onClose={vi.fn()}>content</BottomSheet>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/components/BottomSheet.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/BottomSheet`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/BottomSheet.jsx`:

```jsx
import { motion } from 'framer-motion';
import { useMotionPreset } from '../lib/motionConfig';

// A modal variant that slides up from the bottom instead of popping in
// centered (compare Card.jsx + RateModal.jsx's centered pattern) -- for
// content that reads as a "drill into detail" rather than a short,
// focused action. Dismissed via a backdrop click or a close control the
// caller renders inside `children` (no drag-to-dismiss gesture in v1).
// Callers should wrap usage in <AnimatePresence> for the exit animation
// to play on unmount, same convention as RateModal/AddLoadModal today.
function BottomSheet({ onClose, children, className = '' }) {
  const preset = useMotionPreset();
  return (
    <motion.div
      role="presentation"
      onClick={onClose}
      initial={preset.sheet.backdrop.initial}
      animate={preset.sheet.backdrop.animate}
      exit={preset.sheet.backdrop.exit}
      transition={preset.sheet.backdrop.transition}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        initial={preset.sheet.panel.initial}
        animate={preset.sheet.panel.animate}
        exit={preset.sheet.panel.exit}
        transition={preset.sheet.panel.transition}
        className={`max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-4xl border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(10,11,16,0.18)] ${className}`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        {children}
      </motion.div>
    </motion.div>
  );
}

export default BottomSheet;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/BottomSheet.test.jsx`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BottomSheet.jsx frontend/tests/components/BottomSheet.test.jsx
git commit -m "feat: add BottomSheet component"
```

---

## Task 7: Deliberate Apple-leaning font stack

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/tailwind.config.js`

No automated test for this step — it's a font-loading/CSS-config change with no behavior to assert against in jsdom (Vitest's test environment doesn't actually load webfonts or compute rendered font metrics). Verified manually in Step 3.

- [ ] **Step 1: Load Inter as the cross-platform fallback**

In `frontend/index.html`, add inside `<head>`, after the existing `<title>BulkPosting</title>` line:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Declare the font stack**

In `frontend/tailwind.config.js`, add a `fontFamily` key to `theme.extend` (alongside the existing `colors` and `borderRadius` keys):

```js
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Segoe UI"', 'sans-serif'],
      },
```

- [ ] **Step 3: Verify manually**

Run: `cd frontend && npm run dev`
Open the app in a browser, inspect any text element via devtools, confirm the computed `font-family` resolves to `-apple-system` (on macOS) or falls through to `Inter` (on Windows/Linux) rather than the browser's default serif/sans-serif. Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/tailwind.config.js
git commit -m "feat: declare an Apple-leaning font stack with Inter fallback"
```

---

## Task 8: Apply the new pieces to the Review queue

**Files:**
- Modify: `frontend/src/components/ReviewQueue.jsx`
- Modify: `frontend/tests/components/ReviewQueue.test.jsx`

Replaces the checkbox-based bulk-select (checkboxes always visible, plain bordered bar) added in the prior bug-fix pass with the Task 3-5 components: a "Select" button reveals per-row `SelectionCircle`s and a `BottomActionBar`. The underlying `bulkSendInquiries`/`bulkRejectInquiries` API calls, the live-reply-body logic, and the single-item send/reject flow are **unchanged** — this task is presentation-only.

- [ ] **Step 1: Update the imports and state**

In `frontend/src/components/ReviewQueue.jsx`, replace the import block:

```js
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listInquiries, sendInquiryReply, rejectInquiry, bulkSendInquiries, bulkRejectInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import Badge from './Badge';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';
```

with:

```js
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listInquiries, sendInquiryReply, rejectInquiry, bulkSendInquiries, bulkRejectInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import { useSelectionMode } from '../lib/useSelectionMode';
import Badge from './Badge';
import BottomActionBar from './BottomActionBar';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';
import SelectionCircle from './SelectionCircle';
```

Replace the state block:

```js
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
```

with:

```js
  const selection = useSelectionMode();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
```

- [ ] **Step 2: Wire `fetchQueue`, the live-update subscription, and single-item reject to the hook**

Replace (inside `fetchQueue`):

```js
          setInquiries(data);
          setDrafts(Object.fromEntries(data.map((inquiry) => [inquiry.id, draftTextFor(inquiry)])));
          setSelectedIds(new Set());
          setStatus('ready');
```

with:

```js
          setInquiries(data);
          setDrafts(Object.fromEntries(data.map((inquiry) => [inquiry.id, draftTextFor(inquiry)])));
          selection.exit();
          setStatus('ready');
```

Replace the `inquiry:updated` subscription handler:

```js
    const unsubscribeUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (inquiry.reply_status === 'pending_review') return;
      setInquiries((prev) => prev.filter((existing) => existing.id !== inquiry.id));
      setSelectedIds((prev) => {
        if (!prev.has(inquiry.id)) return prev;
        const next = new Set(prev);
        next.delete(inquiry.id);
        return next;
      });
    });
```

with:

```js
    const unsubscribeUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (inquiry.reply_status === 'pending_review') return;
      setInquiries((prev) => prev.filter((existing) => existing.id !== inquiry.id));
      selection.remove(inquiry.id);
    });
```

Replace, inside `handleReject`'s `.then(...)`:

```js
      .then(() => {
        if (isMountedRef.current) {
          setInquiries((prev) => prev.filter((inquiry) => inquiry.id !== id));
          setSelectedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      })
```

with:

```js
      .then(() => {
        if (isMountedRef.current) {
          setInquiries((prev) => prev.filter((inquiry) => inquiry.id !== id));
          selection.remove(id);
        }
      })
```

- [ ] **Step 3: Replace `toggleSelectOne`/`toggleSelectAll` and the bulk handlers**

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
    setSelectedIds((prev) => (prev.size === inquiries.length ? new Set() : new Set(inquiries.map((inquiry) => inquiry.id))));
  }
```

Replace `handleBulkSend`:

```js
  function handleBulkSend() {
    setError(null);
    setBulkBusy(true);
    const items = Array.from(selectedIds).map((id) => ({ id, body: drafts[id] }));
    bulkSendInquiries(items)
      .then((res) => {
        if (!isMountedRef.current) return;
        const succeededIds = new Set(res.results.filter((r) => r.ok).map((r) => r.id));
        const failed = res.results.filter((r) => !r.ok);
        setInquiries((prev) => prev.filter((inquiry) => !succeededIds.has(inquiry.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
        if (failed.length > 0) {
          setError(`${failed.length} of ${res.results.length} selected replies could not be sent: ${failed.map((f) => f.error).join('; ')}`);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to send the selected replies.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setBulkBusy(false);
        }
      });
  }
```

with:

```js
  function handleBulkSend() {
    setError(null);
    setBulkBusy(true);
    const items = Array.from(selection.selectedIds).map((id) => ({ id, body: drafts[id] }));
    bulkSendInquiries(items)
      .then((res) => {
        if (!isMountedRef.current) return;
        const succeededIds = res.results.filter((r) => r.ok).map((r) => r.id);
        const failed = res.results.filter((r) => !r.ok);
        setInquiries((prev) => prev.filter((inquiry) => !succeededIds.includes(inquiry.id)));
        if (failed.length === 0) {
          selection.exit();
        } else {
          succeededIds.forEach((id) => selection.remove(id));
          setError(`${failed.length} of ${res.results.length} selected replies could not be sent: ${failed.map((f) => f.error).join('; ')}`);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to send the selected replies.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setBulkBusy(false);
        }
      });
  }
```

Replace `handleBulkReject`:

```js
  function handleBulkReject() {
    setError(null);
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    bulkRejectInquiries(ids)
      .then(() => {
        if (!isMountedRef.current) return;
        setInquiries((prev) => prev.filter((inquiry) => !selectedIds.has(inquiry.id)));
        setSelectedIds(new Set());
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to reject the selected inquiries.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setBulkBusy(false);
          setConfirmingBulkReject(false);
        }
      });
  }
```

with:

```js
  function handleBulkReject() {
    setError(null);
    setBulkBusy(true);
    const ids = Array.from(selection.selectedIds);
    bulkRejectInquiries(ids)
      .then(() => {
        if (!isMountedRef.current) return;
        setInquiries((prev) => prev.filter((inquiry) => !ids.includes(inquiry.id)));
        selection.exit();
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to reject the selected inquiries.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setBulkBusy(false);
          setConfirmingBulkReject(false);
        }
      });
  }
```

- [ ] **Step 4: Replace the header and bulk-bar markup**

Replace the header line:

```jsx
      <h2 className="mb-3 text-sm font-semibold text-text">Review queue</h2>
```

with:

```jsx
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Review queue</h2>
        {status === 'ready' && inquiries.length > 0 && (
          selection.active ? (
            <div className="flex items-center gap-3 text-sm font-medium">
              <button type="button" onClick={() => selection.selectAll(inquiries.map((inquiry) => inquiry.id))} className="text-accent hover:underline">
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
```

Delete this entire block (the "Select all" checkbox row) — find and remove it exactly:

```jsx
      {status === 'ready' && inquiries.length > 0 && (
        <label className="mb-2 flex items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            aria-label="Select all pending inquiries"
            checked={selectedIds.size > 0 && selectedIds.size === inquiries.length}
            ref={(el) => {
              if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < inquiries.length;
            }}
            onChange={toggleSelectAll}
          />
          Select all
        </label>
      )}
```

Then replace this block (the plain bordered bulk-action bar), which immediately follows it:

```jsx
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
          <span className="font-medium text-text">{selectedIds.size} selected</span>
          <PrimaryButton onClick={handleBulkSend} disabled={bulkBusy} className="px-3 py-1 text-xs">
            {bulkBusy ? 'Sending...' : `Send ${selectedIds.size}`}
          </PrimaryButton>
          {confirmingBulkReject ? (
            <>
              <span className="text-xs text-error">Reject {selectedIds.size}?</span>
              <button
                onClick={handleBulkReject}
                disabled={bulkBusy}
                className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {bulkBusy ? 'Rejecting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingBulkReject(false)}
                disabled={bulkBusy}
                className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingBulkReject(true)}
              disabled={bulkBusy}
              className="rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg disabled:opacity-60"
            >
              Reject selected
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
        <PrimaryButton onClick={handleBulkSend} disabled={bulkBusy} className="px-3 py-1 text-xs">
          {bulkBusy ? 'Sending...' : `Send ${selection.selectedIds.size}`}
        </PrimaryButton>
        {confirmingBulkReject ? (
          <>
            <span className="text-xs text-error">Reject {selection.selectedIds.size}?</span>
            <button
              onClick={handleBulkReject}
              disabled={bulkBusy}
              className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {bulkBusy ? 'Rejecting...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmingBulkReject(false)}
              disabled={bulkBusy}
              className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingBulkReject(true)}
            disabled={bulkBusy}
            className="rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg disabled:opacity-60"
          >
            Reject selected
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

- [ ] **Step 5: Replace the per-row checkbox**

Replace:

```jsx
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    aria-label={`Select inquiry from ${inquiry.from_address}`}
                    checked={selectedIds.has(inquiry.id)}
                    onChange={() => toggleSelectOne(inquiry.id)}
                  />
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
```

with:

```jsx
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-text">
                  {selection.active && (
                    <SelectionCircle
                      selected={selection.isSelected(inquiry.id)}
                      onToggle={() => selection.toggle(inquiry.id)}
                      ariaLabel={`Select inquiry from ${inquiry.from_address}`}
                    />
                  )}
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
```

- [ ] **Step 6: Update the test file to match**

Replace the entire contents of `frontend/tests/components/ReviewQueue.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ReviewQueue from '../../src/components/ReviewQueue';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

const INQUIRY_1 = {
  id: 1, from_address: 'carrierA@example.com', subject: 'Dallas load?',
  reply_status: 'pending_review', reply_body: null, live_reply_body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL',
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};

const INQUIRY_2 = {
  id: 2, from_address: 'carrierB@example.com', subject: 'Chicago load?',
  reply_status: 'pending_review', reply_body: 'stale draft', live_reply_body: 'PU: CHICAGO, IL\nDEL: MIAMI, FL',
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};

describe('ReviewQueue', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('seeds the draft textarea from live_reply_body, not the stale reply_body snapshot', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_2]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    expect(screen.getByLabelText('Reply').value).toBe('PU: CHICAGO, IL\nDEL: MIAMI, FL');
  });

  test('falls back to reply_body when live_reply_body is null (no matched load)', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY_1, live_reply_body: null, reply_body: 'fallback text' }]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));
    expect(screen.getByLabelText('Reply').value).toBe('fallback text');
  });

  test('a live-pushed new inquiry also seeds its draft from live_reply_body', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeDefined());

    act(() => {
      liveHandlers['inquiry:new'](INQUIRY_1);
    });

    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));
    expect(screen.getByLabelText('Reply').value).toBe('PU: DALLAS, TX\nDEL: CHICAGO, IL');
  });

  test('no selection circle or bulk bar shows until "Select" is clicked', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  describe('selection mode and bulk actions', () => {
    test('clicking "Select" reveals selection circles and "Select All"/"Done" controls', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));

      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierB@example.com' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    test('checking one inquiry shows the bulk action bar with a count of 1', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('"Select All" checks every inquiry and the count matches', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierB@example.com' })).toHaveAttribute('aria-checked', 'true');
    });

    test('"Done" exits selection mode, hiding the circles and the bulk bar', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    test('"Clear selection" empties the selection but stays in selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toBeInTheDocument();
    });

    test('bulk-sending selected inquiries calls bulkSendInquiries with each one\'s current draft text, then exits selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      inquiriesApi.bulkSendInquiries.mockResolvedValue({
        results: [{ id: 1, ok: true }, { id: 2, ok: true }],
      });
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /send 2/i }));

      await waitFor(() => {
        expect(inquiriesApi.bulkSendInquiries).toHaveBeenCalledWith([
          { id: 1, body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL' },
          { id: 2, body: 'PU: CHICAGO, IL\nDEL: MIAMI, FL' },
        ]);
      });
      await waitFor(() => {
        expect(screen.queryByText('carrierA@example.com', { exact: false })).not.toBeInTheDocument();
        expect(screen.queryByText('carrierB@example.com', { exact: false })).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    });

    test('a partial bulk-send failure keeps the failed inquiry selected in selection mode and shows an error', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      inquiriesApi.bulkSendInquiries.mockResolvedValue({
        results: [{ id: 1, ok: true }, { id: 2, ok: false, error: 'Reply body cannot be empty.' }],
      });
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /send 2/i }));

      await waitFor(() => {
        expect(screen.queryByText('carrierA@example.com', { exact: false })).not.toBeInTheDocument();
      });
      expect(screen.getByText('carrierB@example.com', { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/1 of 2/);
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    test('bulk-rejecting requires confirmation, then calls bulkRejectInquiries and exits selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      inquiriesApi.bulkRejectInquiries.mockResolvedValue({ updated: 2 });
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));
      expect(inquiriesApi.bulkRejectInquiries).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(inquiriesApi.bulkRejectInquiries).toHaveBeenCalledWith([1, 2]);
      });
      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    });

    test('canceling the bulk-reject confirmation does not call bulkRejectInquiries', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(inquiriesApi.bulkRejectInquiries).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 7: Run the test suite to verify it passes**

Run: `cd frontend && npx vitest run tests/components/ReviewQueue.test.jsx`
Expected: PASS — all 13 tests.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ReviewQueue.jsx frontend/tests/components/ReviewQueue.test.jsx
git commit -m "feat: replace Review queue checkbox bulk-select with Apple-style selection mode"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS on every suite except the two pre-existing, unrelated failures already present on `master` before this plan (`tests/App.test.jsx`'s `usePendingReviewCount` teardown error, `tests/components/DateRangeField.test.jsx`'s timing issue) — confirmed pre-existing via `git stash` + re-run during the prior bug-fix session. If any *other* suite fails, stop and fix before proceeding — do not carry a new regression into Phase 2.

- [ ] **Step 2: Manual smoke check**

Run: `cd frontend && npm run dev`
Open the app, log in, go to the Inquiries tab, click "Select," select a couple of items, confirm the bottom bar slides up with a blurred background and the circles fill with a spring "pop" on tap. Click "Done," confirm everything returns to the plain list view. Stop the dev server (Ctrl+C).

- [ ] **Step 3: Push**

```bash
git push origin master
```

---

## What's next

Phase 2 (Carrier Database — schema, geocoding, standalone Carriers tab, booking-flow hook) gets its own plan document once this one ships, per the spec's phased sequencing.
