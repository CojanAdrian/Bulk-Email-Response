# Live Animations & Motion Polish — Design Spec

Date: 2026-08-09
Status: Approved for planning (phase 3 of 3 in the redesign — final phase,
depends on phase 1's design tokens and phase 2's live WebSocket events)

## Background

Phases 1 and 2 make the app look right and update live with zero added
latency, but with no motion — a new inquiry just silently appears in the
list. This phase adds the animation layer: new data popping in
noticeably, smooth transitions between states, and general interaction
polish, using Framer Motion (new dependency:
`framer-motion` — chosen over CSS-only per the user's explicit
"rich, physics-based" preference from brainstorming).

Every rule below is sourced from the `ui-ux-pro-max` skill's Animation
guidance loaded during brainstorming (duration 150-300ms for
micro-interactions, spring physics over linear/cubic-bezier, motion must
express cause-and-effect not be decorative, exit animations faster than
enter, stagger list items 30-50ms apart, respect
`prefers-reduced-motion`) — this spec doesn't invent a separate animation
philosophy, it applies that guidance concretely to this app's screens.

## What gets animated, and why (cause → effect, not decoration)

**1. Live-arriving inquiries** (the headline feature the user asked for
— "when an email comes in, I want to see it pop up live"):
- `ReviewQueue` / `InquiriesLog`: a new row from `inquiry:new` enters with
  a spring pop (`scale: 0.96 → 1`, `opacity: 0 → 1`, `y: -8 → 0`,
  spring config `{ stiffness: 400, damping: 30 }`) via `AnimatePresence` +
  `motion.li`/`motion.tr`. If several arrive in a burst, they stagger
  40ms apart rather than all popping simultaneously.
- A toast notification (new component, see below) surfaces
  `"New inquiry from {from_address}"` for ~4s, tappable to jump to the
  Inquiries tab if the user isn't already there.
- Row removal (send/reject in `ReviewQueue`, or an `inquiry:updated` that
  moves a row out of `pending_review`) exits faster than it entered
  (~150ms fade+scale-down vs ~250ms enter) — per `exit-faster-than-enter`.

**2. Modals** (`RateModal`, `ContactMethodModal`, `RateSelectionModal`,
`BlastModal`): switch from plain conditional rendering to
`AnimatePresence` so they get a real exit animation instead of vanishing
instantly. Enter/exit: backdrop fades in/out (~200ms), the modal card
itself scales from 0.95→1 with a slight upward motion, mirroring
`modal-motion` guidance ("animate from trigger source"). Escape-to-close
and backdrop-click-to-close (already implemented) are preserved exactly —
this phase only changes *how* the close happens visually, not the
interaction itself.

**3. Tab switching** (Loads ↔ Inquiries in `MainToolPage`): crossfade the
outgoing/incoming `<main>` content (~200ms) instead of an instant swap —
`fade-crossfade` guidance for content replacement within the same
container.

**4. Buttons and interactive rows**: `PrimaryButton`/`SecondaryButton`
(from phase 1) get `whileTap={{ scale: 0.97 }}` — subtle press feedback,
restoring on release, per `scale-feedback` guidance. Lookup search
results and loads-table rows get a subtle background-color transition on
hover (already CSS-hoverable; this phase just makes sure it's a smooth
`transition-colors`, not a hard snap).

**5. Connection-health indicator** (from phase 2): a soft pulse animation
while `'connecting'`, settling to a static dot when `'open'` — the
animation itself communicates "still trying," which stops being
meaningful once connected (no animation on the steady `'open'` state,
avoiding decorative motion that doesn't mean anything — `motion-meaning`
guidance).

**6. Loading states**: replace plain `"Loading..."` text with a small
skeleton block (a pulsing gray rectangle matching the shape of what's
loading — a few rows for tables, a card outline for panels) wherever a
fetch is expected to take >300ms, per `progressive-loading` guidance.
Fetches that typically resolve near-instantly (most of this app's local
API calls) don't need this — added only where it's genuinely useful
(initial load of `LoadsTable`, `ReviewQueue`, `InquiriesLog`,
`DatExportSection`'s loads fetch).

## New shared pieces

- **`frontend/src/components/Toast.jsx`** + a `useToast()` hook / small
  context provider — a queue of dismissable, auto-expiring (4s) toast
  notifications rendered in a fixed corner, used for the "new inquiry"
  live notification. Scoped to this one use case for now — existing
  inline `role="alert"` error messages (forms, panel fetch failures) are
  **not** being converted to toasts; they stay next to what they describe,
  per the `error-placement` guidance from `ui-ux-pro-max` (errors belong
  near the field/panel, not off in a corner). Toasts are for background/
  live events the user didn't just directly cause.
- **`frontend/src/components/Skeleton.jsx`** — a small reusable pulsing
  placeholder block (`animate-pulse` Tailwind utility is enough here, no
  Framer Motion needed for a simple opacity pulse), parameterized by
  height/width/count so each panel can render a shape roughly matching
  its real content.

## Accessibility: `prefers-reduced-motion`

Every Framer Motion animation in this phase is wrapped through a single
shared config helper (`frontend/src/lib/motionConfig.js`) that checks
Framer Motion's `useReducedMotion()` hook and returns near-instant
durations (≤50ms, no spring bounce, no stagger) when the user's OS has
reduced-motion enabled — per the `reduced-motion` guidance, this is not
optional. Toasts and skeletons still appear/disappear (they're
functional, not purely decorative) but without the motion flourish.

## Testing approach

Framer Motion's actual spring physics aren't unit-tested (that's the
library's job, not this app's) — what's tested is behavior:
`AnimatePresence`-wrapped lists still render the right items with the
right content after add/remove (jsdom doesn't run real animation frames,
but React Testing Library's `waitFor` naturally handles the mount/unmount
either way); `Toast`/`useToast()` gets its own test suite (enqueue, render,
auto-dismiss after the timeout, manual dismiss); `Skeleton` gets a trivial
render test; and the `motionConfig` reduced-motion helper is tested
directly (mocking `matchMedia` for `prefers-reduced-motion: reduce` and
confirming it returns the reduced-duration config).

## Out of scope

- Page-level route transitions beyond the Loads/Inquiries tab crossfade
  (this app has no router / no separate routed pages beyond the
  login/register/main-tool state machine already in `App.jsx` — that
  transition is small and infrequent enough not to need its own animation
  budget here).
- Gesture-driven interactions (swipe-to-dismiss, drag-to-reorder) — not
  requested, not needed for a desktop-first internal tool.
