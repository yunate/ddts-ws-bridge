---
name: html-css-beautify
description: >
  Modern, clean HTML and CSS authoring conventions for beautiful, maintainable styling.
  Use when writing or reviewing HTML structure and CSS/SCSS: semantic markup, CSS
  custom properties, Flexbox/Grid layout, modern CSS (clamp, container queries, nesting,
  :has), utility vs component styling, and avoiding common ugliness. Pairs with
  frontend-ui-design for visual principles.
---

# HTML & CSS Beautify Standard

How to write HTML/CSS that is clean, modern, and good-looking. For visual/design
decisions (spacing scale, color, states) see the `frontend-ui-design` skill — this
skill is about the markup and CSS techniques to implement them well.

## CRITICAL: Semantic HTML

### CSS-01: Use semantic elements, not div soup

```html
<!-- BAD -->
<div class="header"><div class="nav">...</div></div>
<div class="btn" onclick="...">Save</div>

<!-- GOOD -->
<header><nav aria-label="Primary">...</nav></header>
<button type="button">Save</button>
```

Use `<header> <nav> <main> <section> <article> <aside> <footer> <button> <a>`
correctly. Headings (`<h1>`–`<h6>`) in order, one `<h1>` per page.

### CSS-02: Forms are labelled and accessible

```html
<label for="url">Video URL</label>
<input id="url" name="url" type="url" required placeholder="https://..." />
```

Every input has an associated `<label>`. Use correct `type` (`url`, `email`, `number`).

## CRITICAL: CSS Custom Properties as the design system

### CSS-03: Drive everything from `:root` tokens

```css
:root {
  /* spacing scale */
  --space-2: 8px; --space-4: 16px; --space-6: 24px;
  /* radius / color / type */
  --radius: 10px;
  --bg: #fff; --surface: #f7f7f8; --border: #e5e7eb;
  --text: #1f2329; --primary: #2563eb;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-4);
}
```

No magic numbers or raw hex inside components — reference tokens. This makes theming
and dark mode a variable swap.

## HIGH: Layout with Flexbox & Grid

### CSS-04: Flexbox for 1D, Grid for 2D — never floats/absolute hacks

```css
/* Row of items with consistent gap */
.toolbar { display: flex; align-items: center; gap: var(--space-3); }

/* Responsive card grid, no media queries needed */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}
```

Use `gap` for spacing between flex/grid children (not margins on each child).

### CSS-05: Center things the modern way

```css
.center { display: grid; place-items: center; }       /* both axes */
.stack  { display: flex; flex-direction: column; gap: var(--space-3); }
```

## HIGH: Modern CSS Features

### CSS-06: Fluid sizing with `clamp()`

```css
h1 { font-size: clamp(1.5rem, 1rem + 2vw, 2.5rem); }
.section { padding: clamp(16px, 5vw, 48px); }
```

### CSS-07: Native nesting + `&` (no preprocessor required)

```css
.btn {
  background: var(--primary);
  &:hover { background: var(--primary-hover); }
  &:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  &[disabled] { opacity: .5; cursor: not-allowed; }
}
```

### CSS-08: Container queries for component-level responsiveness

```css
.card-list { container-type: inline-size; }
@container (min-width: 480px) {
  .card { grid-template-columns: 1fr 1fr; }
}
```

### CSS-09: `:has()`, `:is()`, `:where()` to cut specificity wars

```css
/* style a label when its input is invalid */
.field:has(input:invalid) label { color: var(--danger); }
/* low-specificity grouped reset */
:where(h1, h2, h3) { margin: 0; }
```

### CSS-10: Logical properties for direction-agnostic layout

```css
.box { padding-inline: var(--space-4); margin-block-end: var(--space-6); }
```

## HIGH: Avoiding Ugliness

### CSS-11: A minimal modern reset

```css
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }
body { min-height: 100vh; line-height: 1.5; -webkit-font-smoothing: antialiased; }
img, picture, svg, video { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; color: inherit; }
```

### CSS-12: Don't kill focus, don't over-shadow, keep radius consistent

- Never `outline: none` without a visible `:focus-visible` replacement.
- One border-radius token across the app; one or two soft shadow levels.
- Avoid: harsh pure-black text/shadows, 1px-off alignment, inconsistent gaps,
  text touching container edges, gradients/animations with no purpose.

### CSS-13: Truncate and wrap text deliberately

```css
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.break { overflow-wrap: anywhere; }   /* long URLs */
```

## MEDIUM: Organization & Tooling

### CSS-14: Keep specificity flat

Prefer single class selectors. Avoid ID selectors and deep descendant chains
(`.a .b .c .d`). Avoid `!important` (except utility overrides). Co-locate component
styles (e.g. Vue `<style scoped>`) and keep global CSS to tokens + reset + base.

### CSS-15: Utility-first is fine — be consistent

Tailwind or hand-written utilities both work; don't mix three styling paradigms in
one project. If using Tailwind, still centralize design tokens in the config so the
spacing/color scale stays consistent with `frontend-ui-design`.

## Reference: clean component example

```html
<article class="card">
  <h3 class="card__title">Title</h3>
  <p class="card__desc">Description text.</p>
  <button type="button" class="btn">Action</button>
</article>
```

```css
.card { display: flex; flex-direction: column; gap: var(--space-3);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: var(--space-4); }
.card__title { font-size: 1.125rem; font-weight: 600; }
.card__desc  { color: var(--text-muted); }
.btn { align-self: start; padding: var(--space-2) var(--space-4);
  background: var(--primary); color: #fff; border: 0;
  border-radius: var(--radius); cursor: pointer;
  &:hover { background: var(--primary-hover); }
  &:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; } }
```
