---
target: login page
total_score: 29
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 0
timestamp: 2026-08-01T04-34-49Z
slug: frontend-app-login
---
Method: dual-agent (A: a16951d6de92f2843 · B: aa5a85f74b0cde1a9)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Submit buttons show live-progress copy and disable, but no field-level async feedback beyond that |
| 2 | Match System / Real World | 4 | Plain-language errors throughout, no raw enum/status leaks anywhere in the flow |
| 3 | User Control and Freedom | 3 | Every terminal state offers an escape link; no explicit mid-submit cancel, but low-stakes given form size |
| 4 | Consistency and Standards | 2 | Shared components used consistently across all 4 pages, but the password-toggle button breaks the focus-console language every other control enforces |
| 5 | Error Prevention | 3 | Blur-gated validation, confirm-password mismatch caught before submit |
| 6 | Recognition Rather Than Recall | 4 | Labels persist above every input; password hint stays visible until an error replaces it |
| 7 | Flexibility and Efficiency | 3 | Correct `autocomplete` on every field genuinely helps password managers; autofocus on first field |
| 8 | Aesthetic and Minimalist Design | 3 | Clean single-card composition; atmosphere effects sit at low opacity, don't compete with content |
| 9 | Error Recovery | 4 | Best-in-class here — every failure toast carries an inline action tied to the specific failure (reset password / sign in / request new link), never a dead end |
| 10 | Help and Documentation | n/a | No help surface expected on an auth flow this small |
| **Total** | | **29/36** | **Good (81%)** |

## Design Specificity Verdict

**LLM assessment**: Still mostly generic SaaS auth, with one genuinely specific touch that doesn't yet carry the whole surface. The shared tagline ("Every revision tracked, every change reviewed.") paired with the hairline dot divider and the new Title-Compact heading size are real, deliberate design-system moves — not decoration for its own sake. But they sit above four screens of otherwise-generic copy: "Welcome back," "Set up your workspace in under a minute," "Pick something you haven't used here before." None of that would need to change if this were any other SaaS tool's login page. The tagline is doing 100% of the specificity work for the entire flow — it moved the needle from zero to "one good sentence," not from generic to authored throughout.

**Deterministic scan**: `detect.mjs --json` across all four pages, `auth-shell.tsx`, and `validation.ts` returned **exit 0, zero findings** — clean, consistent with the last two passes.

**Visual overlays**: Not available this run — the dev server was reachable (confirmed 200 at `localhost:3000/login`), but no browser-automation tool is connected in this session, so neither assessment could open a tab or read live DOM/focus state. Both findings below are grounded in source-code inspection I independently re-verified against the actual files, not fabricated visual claims.

## Overall Impression

The functional core of this flow is genuinely strong now — error recovery is best-in-class, the reassurance copy at high-stakes moments (password reset, session revocation) is well-judged, and the design system's own tokens are followed correctly almost everywhere. What's left is one confirmed accessibility regression (the password-toggle's focus ring) that's been flagged twice now without being fixed, one newly-surfaced mobile-viewport risk, and a copy layer that's still one sentence deep on product specificity.

## What's Working

- **Actionable error recovery** — every failure toast (login 401, register 409, expired reset token) gives a one-click path forward specific to that failure, not a generic "try again."
- **Security-conscious reassurance copy** — "Every device has been signed out for your security" anticipates the user's next worry before they have to ask; the forgot-password flow's enumeration-safe copy is handled the same way.
- **Title-Compact applied correctly** — the panel heading matches DESIGN.md's documented `1.0625rem/600/1.3` spec verbatim, a real instance of a documented system rule being followed rather than just asserted.

## Priority Issues

**[P2] Password-toggle focus ring still uses the native browser outline, not `focus-console`** — *confirmed still open, previously flagged in the last audit and not yet fixed.*
- **Why it matters**: Every other interactive element in this exact file (inputs, primary button, links) gets the app's mint-glow `focus-console` treatment. The eye-icon toggle button has no `focus-console`/`outline-none` classes at all, so a keyboard user tabbing through the password field hits a jarring visual discontinuity — glow → native outline → glow — right in the middle of the most delicate step in the form.
- **Fix**: Add `focus-console rounded-sm` (or the equivalent glow classes) to the toggle button's className in `auth-shell.tsx`.
- **Suggested command**: direct one-line fix, or `/impeccable harden`

**[P2] `overflow-hidden` + `min-h-screen` on the auth shell risks clipping content when the mobile keyboard opens**
- **Why it matters**: `AuthShell`'s root is `min-h-screen ... overflow-hidden` with vertically-centered content. On mobile, opening the on-screen keyboard (which happens immediately here, since fields autofocus) shrinks the visual viewport; a height-constrained, centered flex container with `overflow-hidden` and no scroll fallback can clip the submit button or footer link out of reach with no way to scroll to it. This is a real, code-verifiable risk that specifically wouldn't show up in a desktop resize test.
- **Fix**: Replace `overflow-hidden` with `overflow-y-auto` (keep horizontal clipping if the grid/scanline backgrounds need it), or switch `min-h-screen` to `min-h-dvh`.
- **Suggested command**: `/impeccable adapt`

**[P3] Copy specificity is one sentence deep** — subtitles/headlines across all four pages remain generic SaaS boilerplate; only the shared tagline carries domain identity. → `/impeccable clarify`

**[P3] Register collects a password once; reset-password requires password + confirm** — an unexplained asymmetry in how "set a password" is handled by the same design system in two places. Not wrong, just worth a deliberate decision either way. → informational

## Persona Red Flags

**Sam (accessibility)**: The confirmed focus-ring gap hits Sam directly — tabbing through the password field on login, register, or reset-password produces a jarring visual discontinuity exactly where a keyboard-only user is doing the most delicate task in the flow.

**Casey (mobile)**: The `overflow-hidden`/`min-h-screen` combination is a concrete, code-verifiable risk specifically for mobile keyboard interactions — the kind of bug that only shows up on a real phone, not a desktop browser resize, which is likely why it hasn't surfaced before now.

## Minor Observations

- `inputErrorClass` is built via `.replace()` string surgery on `inputClass` — fragile if the base string's literal substrings ever shift order, not a live bug today.
- No caps-lock indicator on password fields — a common nicety, not required by DESIGN.md, low priority.
- `role="alert"` on field errors is correctly and consistently applied across all four pages.

## Questions to Consider

- If the shared tagline is the single carrier of product identity in this entire flow, what happens the moment someone's attention (or screen reader) skips past it — does the auth flow read as anything other than a reskinned generic template?
- DESIGN.md says focus treatment should "never [be] a plain browser outline" — why is the password eye-toggle the one exception in the shared auth component library, and is that a conscious scope decision or something that was simply missed twice now?
