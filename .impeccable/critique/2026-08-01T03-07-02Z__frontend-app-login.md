---
target: login page
total_score: 19
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
timestamp: 2026-08-01T03-07-02Z
slug: frontend-app-login
---
Method: dual-agent (A: a8198e3e990ce4558 · B: a91a0f8ad50ce567f)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Submit state ("Signing in…") is clear, but the 1.5–3s boot-screen wait manufactures a status event that isn't tied to real work. |
| 2 | Match System / Real World | 2 | "Documentation, reviewed together" is abstract marketing-speak, not the plain task-grounded voice DESIGN.md uses elsewhere. |
| 3 | User Control and Freedom | 2 | No password-visibility toggle, no forgot-password link anywhere in the auth flow. |
| 4 | Consistency and Standards | 4 | Shared `inputClass`/`primaryBtn`/`Field` tokens between login and register match DESIGN.md's input/button spec exactly. |
| 5 | Error Prevention | 1 | Only native `type="email"`/`required` guard input — no live validation, typo only caught after a server round-trip. |
| 6 | Recognition Rather Than Recall | 3 | Labels stay visible above fields; no working-memory burden there. |
| 7 | Flexibility and Efficiency | n/a | No meaningful power-user path for a one-shot login form beyond native tab/Enter. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely minimal panel (2 fields + 1 button + 1 link), docked slightly by unmotivated boot pageantry. |
| 9 | Error Recovery | 1 | Toast surfaces only a raw/generic message — no distinction between wrong-password, unknown-account, or rate-limited, no suggested next step. |
| 10 | Help and Documentation | n/a | Not expected on a login screen; not a defect here. |
| **Total** | | **19/32** | **Acceptable (59%)** |

## Design Specificity Verdict

**LLM assessment**: Right at the edge of generic. The `bg-grid`/`bg-scanlines` texture, mint focus-glow, boot sequence's "Establishing secure session…" copy, and near-black surface panel do plant this in the Signal Console world — someone reused the system's tokens correctly. But nothing about the *login form itself* is written for a documentation-review product. "Welcome back / Sign in to pick up where you left off" and "Documentation, reviewed together" are the only two product-referencing strings, and both are boilerplate SaaS copy — neither mentions review, approval, revisions, or the audit-trail differentiator that's the whole reason Kenoma exists. Swap the logo and this is a generic auth template with a scanline background.

**Deterministic scan**: `detect.mjs --json` against `frontend/app/login`, `components/auth-shell.tsx`, and `components/boot-screen.tsx` returned **exit 0, zero findings**. Nothing here trips the automated anti-pattern detector — the token usage, spacing, and component patterns are all clean by that measure. This confirms the design problems below are copy/UX-judgment issues, not code-level anti-patterns a scanner would catch, which is exactly the gap dual-assessment is meant to surface.

**Visual overlays**: Not available this run — no dev server was reachable at `localhost:3000` (connection refused, confirmed via both `curl` and `netstat`), so browser injection was skipped by both assessments rather than fabricated. Start `npm run dev` in `frontend/` and re-run `/impeccable critique` for live browser evidence.

## Overall Impression

The bones are solid and on-brand — token discipline is real, motion is mostly purposeful, and login/register share a clean, consistent shell. But the page never earns its identity: the copy is interchangeable with any SaaS login, there's no way to recover from a lost password, and error feedback tells the user "it failed" without telling them what to do next. This is a page that looks like Kenoma but doesn't yet talk like it.

## What's Working

- **`auth-shell.tsx:22-34`** — `inputClass`/`primaryBtn` are genuinely shared tokens between login and register: mint-tinted outline button, `focus-console` glow, no drop-shadow — exact adherence to DESIGN.md's component rules and the Consistency heuristic's top score.
- **`boot-screen.tsx`** — every animation after the initial materialize loops rather than being timed to a guessed duration, correctly implementing DESIGN.md's "Boot / Loading Sequence" signature component and its "always reads as working, never stuck" rule.
- **`globals.css:301-307`** — `.focus-console` is scoped to `:focus` on the class itself (not a Tailwind `focus:` variant), so the glow only appears while actually focused — small but correct restraint matching "glow signals real state, not decoration."

## Priority Issues

**[P0] No password reset / account recovery path anywhere in the auth flow**
- **Why it matters**: A user who forgets or mistypes their password has zero self-service way out — they're locked out of the entire product with no link, no flow, nothing. For an internal team relying on Kenoma for document approvals, that's a support ticket every time it happens.
- **Fix**: Add a "Forgot password?" `AuthLink` next to the Password field label, wired to a reset flow (even a stub "contact your org admin" page is better than nothing right now).
- **Suggested command**: `/impeccable onboard` (or `/impeccable clarify` if scoping to copy/links only)

**[P1] Boot screen delay is unmotivated on the login page**
- **Why it matters**: `useMinimumDelay(1500, 3000)` forces a 1.5–3s wait for a page that has no session to resolve yet — there's nothing to "establish" before the user has even typed anything. It reads as stalling, not reassurance, and directly undercuts the emotional journey at the very first moment a user meets the product.
- **Fix**: Reserve `BootScreen` for routes with a real async check to bridge (post-login redirect, initial auth-state resolution in the app shell) — skip it entirely on `/login` and `/register`.
- **Suggested command**: `/impeccable onboard`

**[P1] Error toast gives no actionable diagnosis**
- **Why it matters**: `toast.error("Couldn't sign in", { description: ... })` shows either a raw `ApiError.message` or a generic fallback — no distinction between wrong password, unknown account, or rate-limiting, and no suggested next step. The system already defines a full error-state visual language (`focus-console-error`, error glow) that this flow never uses.
- **Fix**: Map known API error codes to specific, human copy ("That password doesn't look right — try again or reset it") and apply the existing `focus-console-error` treatment to the actual field, not just a toast.
- **Suggested command**: `/impeccable clarify`

**[P2] No client-side/inline validation before submit**
- **Why it matters**: Only native `type="email"`/`required` guard the form — a malformed email is only caught by the browser's native bubble at submit time, and the console's own `focus-console-error` styling sits unused in `globals.css` while this form relies on default browser validation UI that doesn't match the rest of the interface.
- **Fix**: Wire a debounced format check that drives the existing `focus-console-error` state + inline hint text instead of the native browser validation bubble.
- **Suggested command**: `/impeccable harden`

**[P3] Tagline and title copy are generic, missing the product's real differentiator**
- **Why it matters**: "Documentation, reviewed together" and "Sign in to pick up where you left off" don't reference review, approval, or the audit trail — the thing that makes Kenoma Kenoma. A first-time visitor learns nothing about the product from its own front door.
- **Fix**: Replace with copy that ties directly to the immutable-revision model without turning jargon-heavy — e.g. "Every revision tracked, every change reviewed."
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Sam (Accessibility-Dependent User)**: No `aria-invalid`/`aria-describedby` wiring for error states — `focus-console-error` exists in `globals.css` but nothing in `login/page.tsx` or `auth-shell.tsx` ever applies it or announces an error to assistive tech, so a screen-reader user gets no signal about *why* a submission failed beyond whatever the toast announces (unverified whether sonner's toast region is `aria-live`-wired). The `Logo` component also renders two `<img>` tags with identical `alt="Kenoma"` toggled by `dark:hidden`/`dark:block` — a screen reader may double-announce "Kenoma" since both DOM nodes exist, just visually hidden.

**Jordan (Confused First-Timer)**: Nothing on this page explains what Kenoma actually does beyond a vague tagline — a first-timer arriving at `/login` (e.g. via a shared invite link) has no context for what they're signing into. Combined with the P0 above, a first-timer who mistypes their temporary password has no visible path forward at all.

## Minor Observations

- `Field` supports a `hint` prop (`auth-shell.tsx:6,17`) that's never used on either input in `login/page.tsx` — a shared affordance sitting unused.
- The theme toggle floats at `absolute right-4 top-4` with no visible label, competing for first-glance attention alongside the form.
- `animate-float` on the logo (6s infinite loop) is ambient/decorative on a static screen with no state change driving it — closer to decoration than DESIGN.md's "state-driven motion" rule prefers, unlike the boot screen's defensible looping-because-still-working pattern.
- No `maxLength`/trim guard on the email input — not a real risk given the single-line layout, but worth a defensive cap.

## Questions to Consider

- If the boot screen is meant to signal "the system is establishing a secure session," why does the *login* page — where no session exists yet — show it at all?
- Kenoma's core value prop is the audit trail / reviewed-revision workflow — why does neither the tagline nor the title say anything about it?
- Given the error-glow vocabulary already exists in `globals.css`, why is the login form's only error surface a generic toast instead of the system's own error-state design language on the actual fields?
