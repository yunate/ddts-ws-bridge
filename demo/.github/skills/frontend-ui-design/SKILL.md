---
name: frontend-ui-design
description: >
  Modern frontend UI/UX design principles for building clean, polished, professional
  web interfaces. Use when designing or reviewing the look and feel of an app: layout,
  spacing, typography, color, dark mode, component states, motion, and accessibility.
  Framework-agnostic visual guidance that pairs with vue-3-typescript and
  html-css-beautify for implementation.
---

# Frontend UI Design Standard

Visual and interaction principles for building interfaces that look intentional and
professional. Framework-agnostic — applies to any web UI.

## CRITICAL: Design Foundations

### UI-01: Use a spacing scale, never arbitrary values

Pick a 4px (or 8px) base scale and use only its multiples for padding, margin, gap:
`4, 8, 12, 16, 24, 32, 48, 64`. Never `13px`, `7px`, `25px`. Consistent rhythm is the
single biggest factor in looking "designed" vs "thrown together".

```css
:root {
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
}
```

### UI-02: Limit the type scale and weights

- One font family for UI (system stack or one webfont). At most two.
- A fixed type scale: `12, 14, 16, 20, 24, 32, 40`. Body text 14–16px.
- 2–3 weights max (e.g. 400 / 500 / 600). Use weight + size for hierarchy, not color.
- Line-height ~1.5 for body, ~1.2 for headings. Limit line length to 60–75 chars.

```css
:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

### UI-03: Constrain the color palette with semantic tokens

Define colors as semantic tokens, not raw hex scattered in components:

```css
:root {
  --bg: #ffffff;
  --surface: #f7f7f8;
  --border: #e5e7eb;
  --text: #1f2329;
  --text-muted: #6b7280;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --danger: #dc2626;
  --success: #16a34a;
}
```

Rules:
- One primary accent color. Neutrals (grays) do 90% of the work.
- Don't use pure black (`#000`) on pure white — soften to `#1f2329` on `#fff`.
- Every text/background pair must meet WCAG AA contrast (4.5:1 for body text).

### UI-04: Establish clear visual hierarchy

Guide the eye with size → weight → color → spacing, in that order of strength.
One primary action per view (filled button); everything else is secondary (outline/ghost).
Group related items with proximity; separate groups with whitespace, not borders.

## HIGH: Layout

### UI-05: Whitespace is a feature

Generous padding inside cards/sections (16–24px), generous gaps between groups
(24–48px). Crowded UIs read as low quality. When unsure, add space.

### UI-06: Align everything to a grid

Use Flexbox/Grid with consistent gaps. Left-align text and form fields. Avoid
center-aligning long text. Keep a max content width (`max-width: 1200px; margin: 0 auto`)
so layouts don't sprawl on wide screens.

### UI-07: Responsive, mobile-first

Design the small screen first, enhance upward. Use `clamp()` for fluid type/spacing,
container queries for component-level responsiveness, and never rely on fixed pixel
widths that break on small viewports.

## HIGH: Components & States

### UI-08: Design ALL interactive states

Every interactive element needs: default, hover, active/pressed, focus-visible,
disabled, and (where relevant) loading. A button with only a default state looks broken.

```css
.btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

Never remove focus outlines without providing a visible alternative (accessibility).

### UI-09: Always design empty, loading, and error states

For any list/data view, design four states: loading (skeletons/spinner), empty
(friendly message + primary action), error (what happened + retry), and populated.
Skipping these is the most common reason an app feels unfinished.

### UI-10: Soft elevation, subtle borders, gentle radius

- Use small border-radius consistently (`6–12px`), one value across the app.
- Prefer 1px subtle borders (`--border`) + soft shadows over heavy drop shadows.
- Layer with subtle shadows: `0 1px 2px rgba(0,0,0,.06)` for cards, slightly larger
  for popovers/modals. Avoid harsh, dark, or large blurry shadows.

## MEDIUM: Dark Mode

### UI-11: First-class dark mode via tokens

Implement dark mode by swapping CSS variables, not duplicating styles:

```css
:root { color-scheme: light; }
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0f1115; --surface: #181b20; --border: #2a2f37;
  --text: #e6e8eb; --text-muted: #9aa1ab;
}
```

In dark mode: don't use pure black backgrounds (use `#0f1115`–`#181b20`), reduce
accent saturation slightly, and lower shadow intensity (shadows read weaker on dark).

## MEDIUM: Motion

### UI-12: Subtle, fast, purposeful animation

- Durations 150–250ms for UI feedback; ease-out for entering, ease-in for leaving.
- Animate `transform` and `opacity` only (GPU-friendly); avoid animating layout props.
- Respect `prefers-reduced-motion: reduce` — disable non-essential motion.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

## MEDIUM: Accessibility (non-negotiable polish)

### UI-13: Accessible by default

- Semantic HTML (`<button>`, `<nav>`, `<main>`, headings in order).
- Keyboard reachable + visible focus for every interactive element.
- Labels tied to inputs; icon-only buttons get `aria-label`.
- Color is never the only signal (pair with icon/text). Meet AA contrast.

## Reference: A "looks good" checklist

Before shipping a screen, verify:
- [ ] Spacing uses the scale; nothing is visually cramped.
- [ ] One clear primary action; hierarchy is obvious at a glance.
- [ ] All interactive states styled (hover/focus/active/disabled/loading).
- [ ] Empty/loading/error states exist for data views.
- [ ] Consistent radius, borders, and soft shadows.
- [ ] Passes AA contrast in both light and dark mode.
- [ ] Keyboard navigable with visible focus; respects reduced motion.
