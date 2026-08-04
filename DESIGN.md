---
name: Kenoma
description: Documentation review console — import, edit, review, and approve revisions.
colors:
  background: "#000000"
  surface: "#0a0a0a"
  surface-muted: "#1a1b1b"
  surface-hairline: "#26262a"
  text-primary: "#f4f4f5"
  text-secondary: "#a8a8ac"
  text-muted: "#8a8a8d"
  text-faint: "#6b6b6e"
  signal-mint: "#51f0a8"
  signal-peach: "#ffb188"
  signal-lime: "#9effa1"
  signal-magenta: "#ff78a5"
typography:
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  title-compact:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.1em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.9em"
    fontWeight: 400
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  2xl: "22px"
spacing:
  gutter: "0.75rem"
  gutter-lg: "1.5rem"
  row-sm: "0.625rem"
  row: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-mint}"
    textColor: "{colors.background}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklch, {colors.signal-mint}, transparent 20%)"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    backgroundColor: "color-mix(in oklch, {colors.signal-magenta}, transparent 90%)"
    textColor: "{colors.signal-magenta}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  panel-default:
    backgroundColor: "color-mix(in oklch, {colors.surface}, transparent 20%)"
    rounded: "{rounded.sm}"
---

# Design System: Kenoma

## Overview

**Creative North Star: "Signal Console"**

Kenoma reads as a quiet, confident operations HUD — the visual language of
a system monitoring something that matters, not a marketing surface and
not a literal terminal emulator. The canonical theme is near-black
(`#000000`) with soft graphite panels, thin hairline borders, and a
restrained mint/peach/lime/magenta signal palette that only glows when
something is genuinely happening: a focused field, a live status, a
successful save. At rest, the interface is calm and precise; state
changes are where the personality lives, expressed through color glow and
motion rather than decoration.

This is a deliberate refinement of an earlier, more literal terminal
aesthetic. The system explicitly rejects CLI cosplay: no `$`/`>`/`#`
prompt glyphs prefixing copy, no ALL-CAPS jargon in toasts or status text,
no raw snake_case/enum strings surfaced to users (status labels read
"in review", never `in_review`). Monospace (JetBrains Mono) is reserved
for genuinely data-shaped content — diffs, IDs, code-like fragments — and
never used as the default UI voice; Space Grotesk carries every heading,
button, and body string, which is what keeps the HUD feeling futuristic
rather than like a shell prompt.

**Key Characteristics:**
- Near-black canonical theme with a light counterpart that inverts
  contrast while preserving the same signal hues and density.
- One primary accent (mint) used sparingly; peach/lime/magenta exist
  purely as semantic status colors (warning/success/error), never as
  decoration.
- Depth conveyed through glow and blur, not drop-shadow elevation.
- Precise, responsive micro-motion (hover lift, press-scale, focus glow,
  staggered reveals) signals state changes rather than being ambient
  decoration.
- Monospace is a data marker, not a brand voice.

## Colors

The palette is a single near-black neutral scale plus four signal hues that
carry meaning, not mood — each signal color maps to exactly one semantic
role (info/primary, warning, success, error) everywhere it appears.

### Primary
- **Signal Mint** (`#51f0a8`): the one accent color — primary buttons,
  focus rings, active nav indicator, links, the "connected" status dot.
  Used sparingly; its rarity is what makes it read as a live signal
  rather than a house color.

### Neutral
- **Void Black** (`#000000` / `--console-950`): canonical page background.
- **Panel Graphite** (`#0a0a0a` / `--console-800`): card/panel surfaces,
  composited at ~80% opacity with backdrop-blur over the void background.
- **Muted Graphite** (`#1a1b1b` / `--console-700`): secondary surfaces,
  hover backgrounds, muted chips.
- **Hairline** (`#26262a` / `--console-600`): every border, divider, and
  input outline in the system.
- **Primary Text** (`#f4f4f5` / `--console-50`): headings and body copy.
- **Secondary Text** (`#a8a8ac` / `--console-200`).
- **Muted Text** (`#8a8a8d` / `--console-300`): secondary labels,
  timestamps, inactive nav.
- **Faint Text** (`#6b6b6e` / `--console-400`): the quietest tier — hints,
  placeholder-adjacent copy.

### Named Rules
**The One Signal Rule.** Only one accent (mint) is used for anything
non-semantic (primary actions, focus, active states). Peach/lime/magenta
never appear except as warning/success/error — introducing a fifth
"decorative" color breaks the console's legibility as a status system.

**The Light Theme Inverts, Never Drifts Rule.** Light mode remaps the same
neutral and signal roles onto a paper-on-graphite scheme holding the same
contrast targets (~15:1 body text, ~9:1 signal accents) — it is not a
separate palette, just the dark scale's values reassigned to keep every
component's color *logic* identical across themes.

## Typography

**Body/UI Font:** Space Grotesk (with `ui-sans-serif, system-ui, sans-serif`)
**Data/Mono Font:** JetBrains Mono (with `ui-monospace, monospace`)

**Character:** Space Grotesk carries every heading, label, button, and
paragraph in the interface chrome — a clean geometric sans that reads as
"futuristic HUD," not "hacker terminal." JetBrains Mono is scoped
exclusively to genuinely data-shaped content (diff text, IDs, inline
code) so its appearance itself signals "this is raw/technical data,"
rather than being the default voice of the product.

### Hierarchy
- **Title** (600, 1.25rem, 1.3 line-height): page-level headings (e.g.
  dashboard "Projects").
- **Title — Compact** (600, 1.0625rem, 1.3 line-height): panel-level headings
  inside a focused single-card surface (e.g. the auth flow's "Welcome back" /
  "Create your account" headings) — a quieter step between Body and Title for
  contexts where the heading shouldn't out-compete the primary action below it.
- **Document Heading** (600, 1.5rem/1.25rem/1.1rem for h1/h2/h3, 1.3
  line-height): headings *inside* imported document content
  (`.kenoma-prose`/`.kenoma-diff`), distinct from UI chrome headings.
- **Body** (400, 1rem, 1.5 line-height): interface copy. Document reading
  content uses a slightly larger, more generous 1.0625rem/1.75 for long-form
  legibility.
- **Label** (500, 0.75rem, 0.1em letter-spacing, uppercase where used):
  status badges, nav-adjacent microcopy — always plain-language labels
  ("draft", "in review"), never raw identifiers.
- **Mono/Data** (400, 0.9em): diffs, table cells holding IDs, inline code.

### Named Rules
**The No Raw Identifiers Rule.** Enum values and permission keys
(`in_review`, `docs:submit_review`) never render verbatim in UI copy —
every one is mapped to a human label before display.

## Layout

Single max-width content column (`max-w-5xl`) centered under a fixed
14-unit-height (`h-14`) sticky header and an 8-unit-height footer status
strip. A collapsible 48-unit-wide (`w-48`) left sidebar nav appears at
`md` and above; below `md` the sidebar hides entirely (no hamburger
drawer currently — nav collapses to header-only). Content padding steps
from `px-4 py-6` (mobile) to `px-4 md:px-8` (desktop). Vertical rhythm
inside panels and tables snaps to the `row`/`row-sm` spacing tokens
(1.25rem / 0.625rem) so adjacent panels' content lines up like a grid.
Page transitions (route changes inside the app shell) replay the
materialize entrance on the content region, keyed by pathname.

## Elevation & Depth

Kenoma is flat-by-default: no traditional drop-shadow elevation stack.
Depth and emphasis are conveyed through **glow** (colored box-shadow halos
tied to a signal hue) and **blur** (backdrop-blur on panels floating over
the void background), not through shadow layering. A single ambient
`shadow-panel` token exists for a barely-there separation cue under
sticky/floating chrome; every other sense of "this is elevated" comes from
a signal-color glow appearing in response to state (focus, hover, active,
success), never sitting on an element at rest.

### Shadow Vocabulary
- **Panel Ambient** (`box-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.28)` in dark): the one non-glow shadow, used only for the header/panel separation from the void background.
- **Glow – Info/Mint** (`0 0 0 1px rgb(81 240 168 / 0.45), 0 0 12px 0 rgb(81 240 168 / 0.35)`): focus rings, hover-lift on interactive rows, the "connected" indicator.
- **Glow – Warning/Peach**, **Glow – Success/Lime**, **Glow – Error/Magenta**: same halo shape, swapped to the semantic hue, used only on the matching status state.

### Named Rules
**The Glow-Not-Lift Rule.** Depth reads through color intensity and blur
radius, never through a heavier drop shadow. If something needs to feel
"raised," give it a glow before reaching for `box-shadow`.

## Shapes

Corners are soft but tight: a `sm`→`2xl` radius scale from 8px to 22px,
consistently rounder than a boxy terminal window but tighter than the
shadcn default so dense data (tables, badges, stacked panels) doesn't
feel mushy. Buttons/inputs sit at `lg` (12px); small panels and code
chips at `sm` (8px); larger surfaces and dialogs scale up toward `xl`/`2xl`.
Borders are hairline-thin (1px, `--console-600`) throughout — the system
has no thick/heavy border weight. Circles appear only for true point
indicators (status dots, avatar-style org glyphs), never as a general
container shape.

## Components

Buttons, inputs, and panels share one feel: **precise and responsive** —
tight micro-motion (hover lift, press-scale, focus glow) that makes the
interface feel immediate without being showy. Nothing animates without a
state change driving it.

### Buttons
- **Shape:** rounded-lg (12px), hairline border on `outline`/`ghost` only.
- **Primary:** signal-mint background, near-black text, `hover:bg-primary/80`.
- **Secondary/Outline/Ghost/Destructive:** neutral or transparent
  backgrounds with signal-mint/magenta text or border per variant; the
  same size scale (`xs`/`sm`/`default`/`lg`/`icon`) applies to all variants.
- **Hover/Focus:** background opacity shift on hover; on focus, a 3px
  ring in the signal-mint color plus an outward glow (`focus-console`
  utility) — never a plain browser outline.
- **Press:** a 1px downward translate + `active:scale-[0.97]` (press-scale)
  gives tactile click feedback.

### Cards / Panels
- **Corner Style:** `sm` radius (8px).
- **Background:** `surface` (graphite) at ~80% opacity with backdrop-blur,
  composited over the void background — never fully opaque.
- **Border:** hairline, ~80% opacity.
- **Shadow Strategy:** none at rest; see Elevation & Depth for the glow
  language used on interactive panel states.

### Inputs / Fields
- **Style:** transparent background, hairline border, `lg` radius (12px),
  32px height to match buttons.
- **Focus:** signal-mint 3px ring + outward glow (mirrors button focus).
- **Error:** border and ring swap to signal-magenta (`focus-console-error`).

### Navigation
- Sidebar items are plain-language labels with a leading icon; active
  state is a left-edge signal-mint border + 10%-opacity mint background
  wash, not a filled pill. Inactive items are muted text that brightens on
  hover with a subtle horizontal nudge (`hover:translate-x-0.5`). No
  uppercase, no glyph prefixes.

### Status Badge (signature component)
The canonical way any revision/document state is shown: a small glyph
(`○`/`◐`/`●`/`✕`) paired with a plain-language label ("draft", "in
review", "approved", "rejected") in the matching signal color, with an
optional text-glow variant for emphasis (e.g. the header's live
"Connected" indicator). This is the pattern every future status
indicator should follow — glyph + human label + semantic color, never a
raw enum string or an ALL-CAPS chip.

### Boot / Loading Sequence (signature component)
The full-screen boot screen (shown while auth/session state resolves)
assembles the logo mark with a `materialize` entrance, then loops a
scanning progress bar and staggered status lines ("Establishing secure
session…") over a scanline/grid background. Every element after the
initial materialize is a *looping* animation, never one timed to a
guessed duration, so it always reads as "working" rather than "stuck."

## Do's and Don'ts

### Do:
- **Do** reserve JetBrains Mono for diffs, IDs, and code-like fragments only.
- **Do** map every enum/status value to a plain-language label before it
  reaches UI copy (see Status Badge).
- **Do** express depth and emphasis through signal-color glow + blur, never
  through added drop-shadow weight.
- **Do** keep the signal-mint accent rare — reserve it for the one primary
  action or focus state per view.
- **Do** drive animation from real state changes (focus, hover, status,
  route change) and loop any "waiting" animation rather than timing it to
  a guess.

### Don't:
- **Don't** prefix headings, buttons, or toasts with `$`, `>`, `#`, or any
  literal shell-prompt glyph.
- **Don't** write ALL-CAPS or jargon-heavy status/toast copy (e.g. "AUTH
  FAIL") — use plain sentence-case, human phrasing.
- **Don't** surface raw snake_case/enum strings (`in_review`,
  `docs:manage_comments`) directly in UI text.
- **Don't** introduce a fifth "decorative" accent color — peach/lime/
  magenta are semantic-only (warning/success/error).
- **Don't** reach for a heavier box-shadow to convey elevation; use glow.
