---
name: Kenoma
description: Documentation review console — import, edit, review, and approve revisions.
colors:
  bg:
    default: "#0B0B0D"
    primary: "#0B0B0D"
    accent: "#E8E8EA"
  text:
    default: "#E8E8EA"
    accent: "#A1A1AA"
  primary: "#51F0A8"
  warning: "#FFB188"
  success: "#9EFFA1"
  error: "#FF78A5"
  subtle: "#18181B"
  default: "#141416"
  brand: "#51F0A8"
typography:
  fontFamily: "Inter, system-ui, sans-serif"
  body:
    fontSize: "14px"
    lineHeight: "20px"
    fontWeight: 400
  small:
    fontSize: "12px"
    lineHeight: "16px"
    fontWeight: 400
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "13px"
    lineHeight: "20px"
    fontWeight: 400
  caption:
    fontSize: "11px"
    lineHeight: "16px"
    fontWeight: 500
    letterSpacing: "0.02em"
    textTransform: "uppercase"
  button:
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.02em"
  dataKey:
    fontSize: "12px"
    fontWeight: 500
    color: "#A1A1AA"
  pageTitle:
    fontSize: "24px"
    lineHeight: "32px"
    fontWeight: 700
spacing:
  page: "32px"
  card: "20px"
  element: "12px"
  control: "8px"
radii:
  panel: "12px"
  control: "8px"
  small: "4px"
---

# Design System: Kenoma

## Overview

Kenoma is a documentation review console: a command deck for a documentation
team that imports, edits, reviews, and approves revisions. The interface
reads as a calm, technical "signal console" — dense with information, honest
about machine states, and restrained in its use of color. It is a tool for
people who parse data quickly, so the visual language favors proximity,
consistency, and low noise over decoration.

The experience is built around one deliberate fiction: the product behaves
like a mission-ready operations terminal. It renders discrete, machine-like
events (records being imported, sessions being established, revisions
changing state) with the visual honesty of a console — monospace data,
cursor feedback, signal hues — while staying comfortable enough to read and
scan all day.

**Key Characteristics:**
- Monospace is reserved for genuinely data-shaped content (IDs, diffs,
  code) and for direct machine feedback. It is the honest type of the
  console, not a costume.
- Color is used as signal, not decoration: each state (info, warning,
  success, error) carries its own hue, and nothing else borrows it.
- Dark is the canonical theme. The interface lives on near-black and uses
  soft glows (mint, peach, lime, magenta) where a flat fill would feel dead.
- Everything is dense and aligned to a rhythm: the console grid (`24px`)
  and spacing scales enforce a tight, repeatable layout.
- The console talks plainly. Copy states what is happening; it never
  anthropomorphizes or invents drama.

## Colors

The palette is two near-black surfaces and a set of signal hues. Every color
is a CSS variable, and the whole palette flips with the `.dark` class. Dark
is the default; light mode inverts to paper-on-graphite while preserving the
same contrast targets (~15:1 body text, ~9:1 signal accents).

### Neutral
- **Near-black** (`#0B0B0D` / `--console-950`): the page background, in
  dark mode. Deliberately *not* `#000000`: pure black under near-white text
  runs ~19.6:1, where light-on-dark type haloes and picks up subpixel
  fringing. Body text sits near 15:1 instead.
- **Panel** (`#141416` / `--console-800`): card and panel surfaces.
- **Raised** (`#1E1E21` / `--console-700`): hover states and elevated
  surfaces.
- **Text** (`#E8E8EA` / `--console-50`): primary text.
- **Muted Text** (`#A8A8AC` / `--console-200`): secondary text, hints,
  metadata.
- **Border** (`#2B2B30` / `--console-600`): hairlines and dividers.

### Primary
- **Mint** (`#51F0A8` / `--signal-info`): the product's primary action
  hue. Used for the brand mark, primary buttons, focus rings, active nav
  states, and status accents.

### Semantic
- **Peach** (`#FFB188` / `--signal-warning`): warnings and pending states.
- **Lime** (`#9EFFA1` / `--signal-success`): success and approvals.
- **Magenta** (`#FF78A5` / `--signal-error`): errors and destructive
  actions.

### Named Rules
**The Signal Discipline Rule.** Each signal hue is reserved for its state.
Do not use mint for arbitrary accent decoration, peach for neutral content,
or any hue as a general highlight. If a surface needs an accent, it inherits
the primary mint; if it needs to express state, it uses the matching signal.

**The Contrast Rule.** Signal hues on near-black must clear ~4.5:1 against
their background; body text must clear ~15:1. When in doubt, darken the
surface, not the text.

## Typography

**Primary Font:** Inter — a screen-first sans-serif with a tall x-height and
open apertures, drawn and hinted for small sizes. This interface runs at
12-14px through dense tables and forms; a display face renders unevenly there,
which is why the previous one (Space Grotesk) was replaced.

**Monospace Font:** JetBrains Mono — reserved for genuinely data-shaped
content (IDs, diffs, code) and for direct machine feedback like the boot
screen's status lines. It is the honest type of the console, not a costume.

**Character:** The interface is confident and understated. Headings are
compact and tight; body copy is small but legible. There is no decorative
type, no italic flourish, no uppercase shouting outside captions.

### Hierarchy
- **Page Title** (24px, 700): top-level page headings.
- **Card Title** (14px, 600): panel and card headings.
- **Body** (14px, 400): default text.
- **Small** (12px, 400): secondary text, metadata, hints.
- **Caption** (11px, 500, uppercase): table headers and section labels.
- **Button** (14px, 600): button labels.
- **Data Key** (12px, 500): property labels in data-dense contexts.
- **Mono** (13px): IDs, diffs, code, machine feedback.

### Named Rules
**The Mono-is-Data Rule.** Monospace is reserved for data-shaped content
(IDs, diffs, code) and direct machine feedback. Do not use it for general
body copy or decorative effect.

**The Caps-is-Caption Rule.** Uppercase is reserved for captions, table
headers, and section labels. Do not uppercase body copy or button labels
for emphasis.

## Layout

Kenoma's layout is a tight, two-column console grid: a persistent left
sidebar for navigation and a right-side content pane. Everything snaps to a
`24px` base grid, with spacing scales (`page: 32px`, `card: 20px`,
`element: 12px`, `control: 8px`) that keep density high and rhythm
repeatable.

### Page Structure
- **Left Sidebar:** navigation and workspace identity. Fixed, collapsible.
- **Content Pane:** the current surface. Scrolls independently, carries the
  page title and its toolbar at top.
- **Top Bar:** when present, holds the current workspace name, search, and
  user controls.

### Component Anatomy
- **Panels** (`--radius-panel: 12px`, `bg-console-800/80`, hairline
  border, soft shadow): the core container for data surfaces.
- **Controls** (`--radius-control: 8px`): inputs, selects, buttons.
- **Small** (`--radius-small: 4px`): badges, chips, inline tags.

## Elevation & Depth

Elevation is quiet and consistent: panels sit on the page with a hairline
border and a soft shadow (`--shadow-panel`). Hover states raise surfaces
slightly and add a mint glow (`hover-lift`). The console's depth language is
**glow, not shadow**: interactive elements (buttons, focus rings, active
rows) announce themselves with a soft mint or state-hue glow rather than a
drop shadow.

### Named Rules
**The Glow-is-State Rule.** Glow communicates state and focus, never
decoration. A mint glow on an active row, a magenta glow on a destructive
action, a pulse on the brand mark. Do not add glow to static content.

## Shapes

The console favors rounded rectangles: panels at `12px`, controls at `8px`,
small elements at `4px`. Corners are soft but tight — enough to read as a
sleek interface rather than a boxy terminal window, while staying crisp in
dense data layouts. No circular elements except status dots and avatars.

### Named Rules
**The Soft-Corner Rule.** Keep radii within the scale (12/8/4). Do not
introduce pill-shaped buttons or fully circular elements outside status
dots and avatars.

## Components

### Panel
The core data container: `bg-console-800/80`, hairline border, soft shadow,
`12px` radius, `20px` padding. Holds tables, forms, and stats. Panels snap
to the vertical rhythm so their content lines up like a terminal's row grid.

### Button
- **Primary:** mint fill, near-black text, 600 weight, `8px` radius.
  Reserved for the one main action on a surface.
- **Ghost/Secondary:** transparent or subtle fill, text + hairline border.
  For secondary actions.
- **Destructive:** magenta outline/fill. For destructive actions only.

### Status Badge
A small pill (`4px` radius, caption text) whose fill and text carry a
signal hue. "Draft", "In review", "Approved", "Imported" are the core
revision states. The badge's hue is its message; the label is explicit
wording, never an enum.

### Table
Dense, aligned to the console grid. Caption-size headers, `12px` body,
`--spacing-row` (20px) row height, hover via `row-hover`. IDs and codes in
monospace; statuses as badges.

### Boot Screen
A full-screen `bg-console-950` surface shown while the app
confirms whether an active session exists. The mark materializes, a scan
sweeps the progress line, and status lines deal in one after the other —
a loop, not a one-shot timed to a guessed duration, so it reads as
"working," not "stuck," no matter how long the actual check takes.
`aria-busy` marks the wait; status lines use `role="status"` +
`aria-live="polite"`.

## Do's and Don'ts

### Do:
- **Do** use monospace for data-shaped content: IDs, diffs, code, machine
  feedback.
- **Do** reserve each signal hue for its state and use mint for primary
  actions only.
- **Do** align content to the console grid and vertical rhythm.
- **Do** use glow to communicate focus, hover, and state.

### Don't:
- **Don't** use monospace for general body copy.
- **Don't** use uppercase for body text or buttons.
- **Don't** decorate with signal hues — color always means something.
- **Don't** introduce pill shapes or heavy drop shadows; depth is glow.
- **Don't** round corners beyond the 12/8/4 scale.