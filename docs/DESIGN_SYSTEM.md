# DrowsyCraft Design System

_A "sleepy camp" visual language: soft pastel colors, rounded shapes, friendly
icons, clean rounded typography — matching the feel of Pokémon Sleep without
using any of its copyrighted assets. All colors, fonts, and icon choices below
are original/open-source, chosen to evoke the same warmth, not copied from it._

This document is the reference for applying the redesign to `index.html` /
`app.jsx`. It replaces the current cool-green "garden" palette and Inter/
monospace-heavy typography with a warmer, rounder system.

---

## 1. Brand feel

Three words: **cozy, rounded, unhurried.** Every design decision below should
be checked against these — if a choice makes the UI feel sharper, colder, or
more "dashboard-like," it's probably wrong for this app.

- Warm, low-saturation colors over bright/neon ones
- Generous rounding — nothing under 10px radius
- Friendly filled/rounded icons over thin technical outlines
- A chunky rounded display font for headers and numbers, a soft body font for
  everything else
- Monospace used sparingly, as a small accent for raw stats — not the default
  voice of the app (today it's overused: labels, frequencies, nature effects
  are all monospace, which reads more "terminal" than "cozy bedtime game")

---

## 2. Color palette

Two full palettes — "Daytime Camp" (light) and "Nighttime Sleep" (dark) —
replacing the current `:root` / `[data-theme="dark"]` blocks in `index.html`.
Same variable names as today, so no call sites in `app.jsx` need to change —
only the token values in the `<style>` block.

### Daytime Camp (light)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FFF8ED` | Page background (warm cream, not white) |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-alt` | `#FFECD1` | Nested panels, stat chips |
| `--border` | `#F4DDBB` | Default hairline |
| `--border-strong` | `#E8C48C` | Emphasized border |
| `--text-primary` | `#4A3728` | Body text (warm brown, not black) |
| `--text-secondary` | `#8A6F56` | Supporting text |
| `--text-muted` | `#C7B199` | Placeholders, hints |
| `--accent` | `#FF9F40` | Primary actions, active nav (marigold) |
| `--accent-strong` | `#E07E1F` | Accent hover/pressed |
| `--accent-soft` | `#FFE1B0` | Accent tint background |
| `--on-accent` | `#FFFFFF` | Text on accent fill |
| `--success` / `--success-bg` | `#6FBE8F` / `#E3F5EA` | Positive states |
| `--info` / `--info-bg` | `#7FADD9` | Informational states |
| `--danger` / `--danger-bg` | `#F0785C` / `#FDEAE4` | Destructive states |
| `--tier-s` / `--tier-s-bg` | `#F2C14E` / `#FCF1D6` | S-tier badge |
| `--tier-a` / `--tier-a-bg` | `#7FBE7A` / `#E7F4E4` | A-tier badge |
| `--tier-b` / `--tier-b-bg` | `#7FADD9` / `#E7F1FA` | B-tier badge |
| `--tier-c` / `--tier-c-bg` | `#B4A88F` / `#F1EAE0` | C-tier badge |
| `--tier-d` / `--tier-d-bg` | `#D8CBB5` / `#F6F1E8` | D-tier badge |

Specialty colors (Berries / Ingredients / Skills / All) — used today via
`SPECIALTY_COLOR` in `app.jsx`:

| Specialty | Hex |
|---|---|
| Berries | `#E8628A` (soft rose) |
| Ingredients | `#6FBE73` (soft sage green) |
| Skills | `#6A9EE0` (soft sky blue) |
| All | `#F2C14E` (soft gold) |

### Nighttime Sleep (dark)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#1B1730` | Page background (deep indigo night sky) |
| `--surface` | `#262042` | Cards |
| `--surface-alt` | `#322A56` | Nested panels |
| `--border` | `#40376B` | Default hairline |
| `--border-strong` | `#544A87` | Emphasized border |
| `--text-primary` | `#F3EEFF` | Body text |
| `--text-secondary` | `#C6B9F0` | Supporting text |
| `--text-muted` | `#8477B0` | Placeholders, hints |
| `--accent` | `#FFB86B` | Primary actions (warm glow against the night) |
| `--accent-strong` | `#FFA548` | Accent hover/pressed |
| `--accent-soft` | `#3D3364` | Accent tint background |
| `--on-accent` | `#241905` | Text on accent fill |
| `--success` | `#7FD1A0` | Positive states |
| `--info` | `#8FC0EE` | Informational states |
| `--danger` | `#F0947E` | Destructive states |
| `--tier-s` | `#F5D26E` | S-tier |
| `--tier-a` | `#8FD18A` | A-tier |
| `--tier-b` | `#8FC0EE` | B-tier |
| `--tier-c` | `#A79BC7` | C-tier |
| `--tier-d` | `#6E6396` | D-tier |

**Why this palette over the current one:** the current greens read as
"garden/nature app." Pokémon Sleep's actual feel is warm campfire tones by
day (Snorlax's tan/orange fur, warm wood) and a soft starry indigo by night —
this palette leans into that contrast instead of using one green hue for
both modes.

---

## 3. Typography

Replace the current single-font-family (`Inter`) setup with a two-font
pairing, both open-source on Google Fonts (same CDN mechanism already used
for Inter today — just swap the `<link>` and `font-family` values):

```html
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet"/>
```

| Role | Font | Weight | Where |
|---|---|---|---|
| Display / headers | **Baloo 2** | 700 (600 for smaller headers) | App title, view titles ("Add Pokémon"), big numbers (score, RP) |
| Body / UI text | **Nunito** | 400 regular, 600–700 for labels/buttons | Everything else — form labels, card text, buttons |
| Stat accents (sparingly) | **JetBrains Mono** | 600 | Small numeric tags only (SCORE/RP chip labels) — not every label like today |

**Baloo 2** is a rounded, slightly chunky display face — the closest
open-source match to the bubbly, friendly headline lettering mobile games in
this genre use. **Nunito** has rounded terminals (the ends of letter strokes
are curved, not flat) which reads distinctly softer than Inter at a glance
while staying just as legible at small UI sizes.

**Reduce monospace usage.** Today almost every label (`FREQUENCY`,
`NATURE`, subskill slot levels, etc.) is `font-family: monospace` with
letter-spacing — that's a deliberate "data readout" aesthetic that reads
technical/cold. Keep monospace only for the handful of raw stat numbers
(SCORE, RP) as a small "this is a precise game number" accent; move
everything else (labels, section headers) to Nunito with `text-transform:
uppercase` and normal letter-spacing instead.

---

## 4. Icon system

**Current:** [Tabler Icons](https://tabler.io/icons) (outline, MIT license),
loaded via CDN, used through a small `Icon({name, size})` wrapper component
in `app.jsx` that renders `<i class="ti ti-{name}">`. This abstraction is
exactly right — it means switching the entire icon set is a two-line change
(swap the CDN `<link>`, swap the class prefix) plus renaming icon strings at
each call site, not a structural rewrite.

**Recommended replacement — [Phosphor Icons](https://phosphoricons.com/)**
(MIT license, open source):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/fill/style.css"/>
```

Phosphor ships multiple weights from the same icon set — `regular`, `bold`,
`fill`, `duotone`. The **`fill`** weight (solid, rounded shapes) is the
closest match to a friendly mobile-game icon style; `duotone` (two-tone,
one shape lighter) is a good alternative for a slightly softer look without
going fully solid.

```jsx
// Update the Icon component's className, keep the same call sites:
function Icon({name, size, style}) {
  return <i className={`ph-fill ph-${name}`} style={{fontSize:size||16, ...style}} aria-hidden="true"/>;
}
```

Icon names don't map 1:1 between Tabler and Phosphor, so each `<Icon
name="...">` call site needs its string checked against Phosphor's icon
list when migrating (e.g. Tabler's `clipboard-list` → Phosphor's
`clipboard-text`, `swords` → `sword`, `beach` → `umbrella` or `island` —
check [phosphoricons.com](https://phosphoricons.com) for exact matches).

**Alternative — [Iconoir](https://iconoir.com/)** (MIT license): naturally
rounded stroke corners even in its outline weight, so it's a lighter-touch
option if `fill` icons everywhere feels too heavy. Also CDN-installable and
also swappable behind the same `Icon` component.

**Don't** hand-roll SVGs or use emoji — both break the "one consistent icon
family" rule that makes an icon system read as intentional rather than
mixed-and-matched.

---

## 5. Layout & spacing tokens

Add these as new CSS custom properties alongside the color tokens:

```css
:root {
  --radius-sm: 10px;   /* small controls, chips */
  --radius-control: 16px; /* inputs, buttons — up from today's 12px */
  --radius-card: 22px;    /* cards — up from today's 16px */
  --radius-pill: 999px;   /* badges, pill buttons */

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
}
```

**Rounding:** current radii (16px card / 12px control) are already "rounded"
by web-app standards, but Pokémon Sleep's actual UI rounds harder — bump
cards to ~22px and controls to ~16px. Anything under 10px (the current
`.autocomplete-item` has none at all) should get at least `--radius-sm`.

**Shadows:** the current design uses flat 1px borders only, no elevation.
Add a soft, warm-tinted shadow (never pure black) for cards and primary
buttons so surfaces feel like they're gently resting rather than flat-pasted:

```css
--shadow-card: 0 2px 10px rgba(74, 55, 40, 0.06);
--shadow-card-hover: 0 6px 20px rgba(255, 159, 64, 0.18);
--shadow-card-dark: 0 6px 20px rgba(0, 0, 0, 0.35);
```

Use `--shadow-card` as the resting state for `PokemonCard`/dish cards, and
`--shadow-card-hover` on the primary CTA buttons (Save, Build Optimal Team)
so they feel tappable. Keep it subtle — 1-2 shadow uses per screen max, not
on every element, or it stops reading as intentional elevation.

**Buttons:** move primary CTAs (Save to Roster, Build Optimal Team) to fully
pill-shaped (`--radius-pill`) with `--shadow-card-hover` — this is the single
highest-impact change for "feels like a friendly mobile game" vs. "feels like
a web form."

---

## 6. Component patterns

Quick reference for how the tokens above combine on the most common UI
pieces already in the app:

| Component | Pattern |
|---|---|
| **Card** (`PokemonCard`, dish cards) | `--surface` bg, 1px `--border`, `--radius-card`, `--shadow-card` resting / `--shadow-card-hover` on interaction |
| **Specialty/tier badge** | Pill shape (`--radius-pill`), specialty/tier bg + matching dark-shade text (never black-on-color) |
| **Primary button** (Save, Build Team) | `--accent` fill, `--on-accent` text, `--radius-pill`, `--shadow-card-hover`, Baloo 2 or Nunito 700 label |
| **Secondary button** (Edit, Compare) | `--accent-soft` fill, `--accent-strong` text, `--radius-control` |
| **Destructive button** (Remove) | `--danger-bg` fill, `--danger` text, same shape as secondary |
| **Stat chip** (SCORE, RP) | `--surface-alt` bg, `--radius-sm`, JetBrains Mono label (9-10px) + Baloo 2 value |
| **Input/select** | `--surface` bg, 1px `--border`, `--radius-control`, `--border-strong`/`--accent` on focus |
| **Empty state** | Rounded icon-in-circle (mascot-style), Baloo 2 headline, Nunito body, pill CTA button |

---

## 7. How to apply this — migration checklist

1. **Colors** — replace the `:root` and `[data-theme="dark"]` variable
   blocks in `index.html` (and `index.vite.html`, kept in sync) with the two
   palettes in section 2. Every component already reads colors through CSS
   variables, so this alone re-skins the whole app with zero `app.jsx`
   changes.
2. **Typography** — swap the Google Fonts `<link>` for Baloo 2 + Nunito,
   update `body { font-family: ... }`, and add a `.display` utility class
   (Baloo 2) to apply to headers/big numbers in `app.jsx` (currently inline
   `fontSize`/`fontWeight` styles — would need per-call-site
   `fontFamily:"'Baloo 2', sans-serif"` added, or a CSS class swap).
3. **Icons** — swap the Tabler CDN `<link>` for Phosphor's, update the
   `Icon` component's class prefix, then walk each `<Icon name="...">` call
   site (there are ~30) and remap to the closest Phosphor name.
4. **Radius/shadow tokens** — add the new custom properties, bump
   `--radius-card` to 22px, add `--shadow-card` to `PokemonCard`'s style
   object and any other `background:"var(--surface)"` card-like divs.
5. **Verify both themes** — check light and dark mode, and re-check mobile
   + the new desktop grid layout (section 5 above compounds with the recent
   responsive grid work — rounder, shadowed cards in a multi-column desktop
   grid is exactly the "cozy dashboard" look this is aiming for).
6. **Bump `sw.js`'s `CACHE_NAME`** after any of the above ships, same as
   every other visual change to this app — the service worker will keep
   serving the old look otherwise.

This is a visual-only migration — no data model, scoring logic, or view
structure changes. Safe to do incrementally (colors first, then typography,
then icons) rather than as one big-bang change, if you'd rather see each
step live before committing to the next.
