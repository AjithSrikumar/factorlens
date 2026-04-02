# Wealthsimple Design Skills — FactorLens Design Language

This document defines the Wealthsimple-inspired design language used across the entire FactorLens web app. All pages (landing, dashboard, rankings, funds, academy) follow this system.

---

## Design Philosophy

**Clean. Institutional. Data-first.**

- Light background, white cards, navy text
- No dark mode — always light
- Numbers in serif font for elegance
- Labels in uppercase monospace for data clarity
- Generous whitespace, subtle shadows, no gimmicks

---

## Color Tokens

```css
/* Backgrounds */
--off:      #F5F5F3   /* page background (warm off-white) */
--off2:     #EDECEA   /* secondary background */
--white:    #ffffff   /* card background */

/* Text */
--navy:     #0C0E13   /* primary text */
--navy-80:  rgba(12,14,19,.80)
--navy-50:  rgba(12,14,19,.50)   /* muted text */
--navy-30:  rgba(12,14,19,.30)   /* labels, sublabels */
--navy-12:  rgba(12,14,19,.12)   /* borders */
--navy-06:  rgba(12,14,19,.06)   /* subtle fills, hover */
--navy-03:  rgba(12,14,19,.03)   /* faint row hover */

/* Accent — Blue (primary action) */
--blue:     #1A56DB
--blue-lg:  #EBF0FF   /* blue tint background */
--blue-md:  rgba(26,86,219,.13)

/* Success — Green (positive returns) */
--green:    #0A7C4E
--green-lg: #E6F4EE

/* Danger — Red (negative returns, errors) */
--red:      #C5271E
--red-lg:   #FCE8E7
```

---

## Typography

### Fonts
- **Headings / display numbers**: `Instrument Serif` — elegant, editorial weight 400
- **Body / UI**: `DM Sans` — clean, modern, weights 400–700
- **Numbers / code / metrics**: `DM Mono` — technical, tabular

### Scale
```
Display:   clamp(36px, 6vw, 62px)   — hero headlines
H2:        clamp(26px, 3.5vw, 40px) — section headings
H3:        15px, weight 700         — card titles
Body:      15px, weight 400         — paragraph text
Small:     13–13.5px                — metadata
Caption:   10–11px, uppercase, 700  — labels, column headers
Mono:      varies                   — numbers, percentages
```

### Usage Rules
- Section headings use `font-family: var(--font-serif)`, weight 400, `letter-spacing: -.8px`
- All metric values (CAGR, Sharpe, etc.) use `var(--font-serif)` for display, `var(--font-mono)` for inline
- Column headers: `font-size: 10–10.5px; font-weight: 700; letter-spacing: .8–1.5px; text-transform: uppercase; color: var(--navy-30)`

---

## Spacing & Radius

```css
/* Radius */
--r:    16px   /* cards, modals */
--r-lg: 20px   /* large cards */
--r-xl: 28px   /* banners, featured sections */

/* Sections */
Padding: 72px 0 (desktop), 44px 0 (mobile)

/* Page max-width */
max-width: 1160px; margin: 0 auto; padding: 0 32px;
Mobile: padding: 0 16px;
```

---

## Shadows

```css
--sh-xs: 0 1px 2px rgba(0,0,0,.05)
--sh-sm: 0 1px 4px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.04)
--sh:    0 4px 16px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04)
--sh-lg: 0 16px 48px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.05)
```

---

## Cards

```css
/* Base */
background: var(--white);
border: 1px solid var(--navy-12);
border-radius: var(--r-lg);  /* 20px */
overflow: hidden;

/* Hoverable */
transition: all .22s;
:hover { box-shadow: var(--sh); transform: translateY(-3px); border-color: var(--navy-30); }

/* Padding */
Desktop: padding: 28px 32px
Mobile:  padding: 20px
```

---

## Buttons

### Primary (navy)
```css
background: var(--navy);  color: var(--white);
padding: 12px 22px; border-radius: 10px;
font-size: 14px; font-weight: 600; letter-spacing: -.1px;
:hover { background: #1e2432; box-shadow: var(--sh); transform: translateY(-1px); }
```

### Ghost / Secondary
```css
background: var(--white);  color: var(--navy);
border: 1.5px solid var(--navy-12);
:hover { border-color: var(--navy-30); }
```

### Blue (accent action)
```css
background: var(--blue);  color: var(--white);
:hover { background: #1447c0; box-shadow: 0 4px 16px rgba(26,86,219,.28); }
```

### Outline
```css
background: transparent; color: var(--navy);
border: 1.5px solid var(--navy-12);
:hover { border-color: var(--navy-30); background: var(--off2); }
```

---

## Badges / Pills

```
bd-default    bg: var(--navy-06)   text: var(--navy-50)   → generic
bd-blue       bg: #EBF0FF          text: #1A56DB          → info
bd-green      bg: #E6F4EE          text: #0A7C4E          → positive
bd-red        bg: #FCE8E7          text: #C5271E          → negative
bd-momentum   bg: #FFF3E6          text: #B45309          → momentum
bd-multifactor bg: #F3F0FF         text: #6D28D9          → multi-factor
bd-alpha      bg: #FDE8F4          text: #9D1769          → alpha
bd-value      bg: #FEF5E6          text: #92400E          → value
```

---

## Navigation

### Desktop (sticky top)
- Background: `rgba(245,245,243,.93)` + backdrop blur 18px
- Border: `1px solid var(--navy-12)`
- Height: 60px
- Logo: navy square mark + "factorLens" word (blue + navy)
- Links: 13.5px, weight 500, navy-50 default → navy active with white bg + shadow
- CTA: navy filled button "Build Portfolio"

### Mobile Top Bar
- Background: `rgba(245,245,243,.93)` + backdrop blur
- Height: 52px, fixed
- Logo + blue "Build" button

### Mobile Bottom Nav
- Background: `rgba(255,255,255,.97)` + backdrop blur 20px
- Border-top: `1px solid var(--navy-12)`
- Height: 68px (--bnav)
- Icons: 22px SVG, navy-30 default → blue active
- Labels: 10.5px, weight 600
- Links: Home, Portfolio, Rankings, Funds, Learn

---

## Tables

```
thead: background: var(--off); sticky; border-bottom: 1px solid var(--navy-12)
th: 10px, weight 700, letter-spacing .9px, uppercase, color var(--navy-30)
td: 13.5px; padding: 12–13px 16–20px
row hover: background var(--off) or var(--navy-03)
row border: 1px solid var(--navy-06)
```

### Metric values in tables
- Numbers: `font-family: var(--font-serif)`, clamp sizing
- Positive: `color: var(--green)` (#0A7C4E)
- Negative: `color: var(--red)` (#C5271E)
- Rank badges: gold (#FEF3C7/#92400E), silver (#F1F5F9/#475569), bronze (#FFF7ED/#C2410C)

---

## Charts

### Line charts (performance)
- Portfolio line: `#1A56DB` (blue), 2px
- Benchmark (Nifty 50): `#94A3B8`, 2px dashed
- Grid: `rgba(12,14,19,.06)`, 1px

### Bar charts (fiscal year returns)
- Positive bars: `#0A7C4E` (green)
- Negative bars: `#C5271E` (red)

### Chart cards
```css
.ccard {
  background: var(--white);
  border: 1px solid var(--navy-12);
  border-radius: var(--r-lg);
  overflow: hidden;
  margin-bottom: 20px;
}
.ccard-hdr { padding: 20px 28px 16px; border-bottom: 1px solid var(--navy-12); }
.ccard-title { font-size: 15px; font-weight: 700; letter-spacing: -.2px; }
.ccard-body { padding: 24px 28px; }
.cwrap { height: 320px; } /* mobile: 240px */
```

---

## Hero Sections (dark)

Page-level hero bars use `background: var(--navy)` with blue radial gradient.

```css
.hero-like {
  background: var(--navy);
  padding: 48–72px 32px;
  position: relative; overflow: hidden;
}
/* Glow overlay */
::after {
  background: radial-gradient(ellipse 60% 70% at 20% 50%, rgba(26,86,219,.14) 0%, transparent 65%);
}
/* Text colors on dark hero */
h1: color: var(--white); font-family: var(--font-serif);
sub: color: rgba(255,255,255,.48);
labels: color: rgba(255,255,255,.40); uppercase 10.5px
values: color: var(--white); font-family: var(--font-serif);
```

---

## Section Structure Pattern

```
<section style="background: var(--off/--white); padding: 72px 0">
  <div class="pw"> {/* max-width: 1160px, 0 32px padding */}
    <span class="sec-lbl">LABEL</span>
    <h2 class="sec-h2">Heading</h2>
    <p class="sec-sub">Subtitle</p>
    {/* content */}
  </div>
</section>
```

Alternating section backgrounds: navy hero → off-white → white → off-white → white → footer

---

## Performance Number Formatting

- `+12.4%` positive → `color: var(--green)`
- `−8.2%` negative → `color: var(--red)` (use − not -)
- `8.2×` multiplier → `color: var(--green)`
- Neutral/benchmark → `color: var(--navy-50)`
- All percentages: 1 decimal place
- CAGR/large display: `var(--font-serif)`, clamp 20–42px
- Inline metrics: `var(--font-mono)`, 11–13px

---

## Responsive Breakpoint

- `md`: 768px — desktop vs mobile split
- Mobile gets bottom nav + top fixed bar (account for `padding-top: 52px`, `padding-bottom: 68px`)
- Desktop gets sticky top nav
