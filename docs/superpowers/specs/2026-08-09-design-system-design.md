# Design System Rewrite — Design Spec

Date: 2026-08-09
Status: Approved for planning (phase 1 of 3 in the redesign — design system, then real-time infrastructure, then live animations)

## Background

The current frontend (built across sub-projects 1-4 and frontend Phase 3) uses a
generic dark slate + indigo Tailwind palette. The user wants the app to look
"more towards the original" `IGT_DAT_Processor.html` — which, on inspection,
uses a distinctive premium **navy + gold** corporate palette, not just navy.
This phase reskins every existing page/component to that palette, in both a
light theme (default, matching the original directly) and a dark theme
(same brand identity, inverted for dark surfaces), with a persisted toggle.

This is a pure reskin: no behavior changes, no new features. Sub-projects
after this (real-time infrastructure, live animations) build on top of the
same token system this phase establishes.

## Palette (source: `IGT_DAT_Processor.html`'s `:root` CSS variables)

Original tool's raw values (light theme only, since the original had no dark mode):

```
--navy-900: #0a1024   --gold:       #c9a227
--navy-800: #0f1c3d   --gold-light: #e6c869
--navy:     #152a52   --gold-dark:  #a3801e
--navy-light:#1f3a6e  --orange:     #e0722e (unused elsewhere, skip)
--white:    #ffffff   --red:        #b91c1c   --red-bg:   #fdecea
--gray:     #64748b   --amber:      #92600c   --amber-bg: #fff6e5
--gray-light:#f4f6f9
body background: #eef1f6   body text: #1c2733
success green (from #downloadBanner): #1f9d4d on #e8f6ec
```

### Semantic tokens (CSS custom properties, defined once, consumed via Tailwind)

| Token | Light value | Dark value | Used for |
|---|---|---|---|
| `--color-bg` | `#eef1f6` | `#0a1024` (navy-900) | page background |
| `--color-surface` | `#ffffff` | `#0f1c3d` (navy-800) | cards, modals, panels |
| `--color-surface-alt` | `#f4f6f9` (gray-light) | `#152a52` (navy) | table header rows, subtle panels |
| `--color-text` | `#1c2733` | `#e8ecf5` | body text |
| `--color-text-muted` | `#64748b` (gray) | `#9fb0cc` | secondary/meta text |
| `--color-border` | `#e4e8ef` | `#22345c` | card/table borders |
| `--color-accent` | `#152a52` (navy) | `#e6c869` (gold-light) | primary brand accent — links, focus rings, secondary-button outline |
| `--color-accent-strong` | `#0a1024` (navy-900) | `#c9a227` (gold) | headers, high-emphasis text |
| `--color-gold` | `#c9a227` | `#c9a227` | primary-button gradient, top-border accent, badges — same hue both themes, it's the brand's gold, not a surface color |
| `--color-gold-light` | `#e6c869` | `#e6c869` | primary-button gradient endpoint, wordmark |
| `--color-gold-dark` | `#a3801e` | `#a3801e` | primary-button gradient endpoint, hover states |
| `--color-success` | `#1f9d4d` on `#e8f6ec` | `#4ade80` on `#0f2e1a` | success banners |
| `--color-error` | `#b91c1c` on `#fdecea` | `#f87171` on `#3f1414` | error banners, destructive actions |
| `--color-warning` | `#92600c` on `#fff6e5` | `#fbbf24` on `#3f2f0a` | warning/anomaly banners |

Dark theme reasoning (per `ui-ux-pro-max` guidance loaded during brainstorming):
dark mode uses desaturated/adjusted tonal variants, not a literal color
inversion — gold becomes the *primary* accent on dark (it's already
high-contrast against navy-900, matching how the original used gold as the
"pop" color against its own navy header/footer gradients), while navy
recedes to a secondary role. Both text-contrast pairs (`--color-text` /
`--color-text-muted` against `--color-surface`) must independently clear
4.5:1 / 3:1 WCAG AA — verified by hand for the pairs above, not assumed
from the light-theme values.

## Implementation approach

- **Tailwind config**: `darkMode: 'class'`. Add the semantic tokens above as
  CSS custom properties in a new `frontend/src/styles/tokens.css` (`:root`
  block for light, `.dark` block override for dark), then extend
  `tailwind.config.js`'s theme with `colors: { bg: 'var(--color-bg)', surface: 'var(--color-surface)', ... }` so components use `bg-bg`, `bg-surface`, `text-text`,
  `border-border`, `text-accent`, etc. instead of raw Tailwind slate/indigo
  classes or ad-hoc hex values.
- **Theme toggle**: a small `ThemeToggle` component (sun/moon icon button)
  in the header, backed by a `useTheme()` hook that reads/writes
  `localStorage['theme']` (`'light' | 'dark'`, defaulting to the user's OS
  preference via `prefers-color-scheme` on first visit, then `'light'` if
  that can't be determined) and toggles the `dark` class on `<html>`.
- **Component restyle** (behavior-preserving, class-only changes) across
  every existing component: `LoginPage`, `RegisterPage`, `MainToolPage`
  (header/nav), `UploadPanel`, `LoadsTable`, `RateModal`,
  `GmailConnectionPanel`, `ReviewQueue`, `InquiriesLog`,
  `DatExportSection`, `ContactMethodModal`, `RateSelectionModal`,
  `AnomalyReport`, `LoadLookupPanel`, `BlastModal`. Each gets the card
  pattern (surface background, border, gold top-accent via
  `border-t-[3px] border-t-gold` — a new small reusable `Card` wrapper
  component to avoid repeating this everywhere), button patterns (a
  `PrimaryButton`/`SecondaryButton` pair replacing ad-hoc button
  classNames), and badge/pill patterns (status badges in `InquiriesLog`,
  count pills in `AnomalyReport`).
- **New shared components** (introduced this phase, used everywhere going
  forward): `Card.jsx`, `PrimaryButton.jsx`, `SecondaryButton.jsx`,
  `Badge.jsx`, `ThemeToggle.jsx` — small, focused, each independently
  testable, replacing repeated inline Tailwind classes across the 15
  existing components above.

## Accessibility (non-negotiable per `ui-ux-pro-max` guidance)

- All text/background pairs verified ≥4.5:1 (body) / ≥3:1 (large text,
  ≥18px or ≥14px bold) in **both** themes independently.
- Focus rings stay visible in both themes (`focus:ring-2 focus:ring-accent`,
  never removed).
- Color is never the only signal — status badges/banners keep their
  existing text labels alongside color (already true; preserved, not
  newly added).
- Theme toggle itself is a real button with a visible label
  (`aria-label="Switch to dark theme"` / `"Switch to light theme"`), not an
  icon-only control with no accessible name.

## Testing approach

Each new shared component (`Card`, `PrimaryButton`, `SecondaryButton`,
`Badge`, `ThemeToggle`) gets its own focused test suite (renders children,
applies variant classes correctly, `ThemeToggle` persists to
`localStorage` and toggles the `dark` class). Existing component tests
should **not** need behavioral changes — this phase changes `className`
values only, and existing tests assert on text content, roles, and
interaction behavior, not on specific Tailwind classes — so the existing
260 frontend tests are the regression safety net; only the small number of
genuinely new components get new tests.

## Out of scope (later phases)

- Real-time push updates (phase 2)
- Framer Motion animations/transitions (phase 3) — this phase may add
  trivial CSS `transition-colors` for the theme toggle switch itself (a
  reasonable, tiny exception, not a scope violation) but no spring physics,
  no list-entry animations, no page transitions.
