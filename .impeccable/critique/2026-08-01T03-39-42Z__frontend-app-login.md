---
target: login page
total_score: 29
max_score: 32
na_heuristics: 7
p0_count: 0
p1_count: 0
timestamp: 2026-08-01T03-39-42Z
slug: frontend-app-login
---
Method: dual-agent (A: a2a0923cd12922932 · B: a20a08abd2ec0fbc4)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Button text swaps to a progress verb and disables, but it's text-only with no spinner/icon. |
| 2 | Match System / Real World | 3 | Plain language throughout; page titles/subtitles still don't reference documents or review. |
| 3 | User Control and Freedom | 4 | Every dead-end (invalid token, done state, forgot-password) has an explicit way back to login. |
| 4 | Consistency and Standards | 3 | Shared components used consistently across all 4 screens, but `primaryBtn`/`inputClass` deviate from DESIGN.md's own button/input token spec (see P2/P3). |
| 5 | Error Prevention | 3 | Inline validation now covers empty-required cases on every field (fixed live during this critique — see below); still no format prevention beyond email regex. |
| 6 | Recognition Rather Than Recall | 3 | Password hint shown proactively before an error occurs. |
| 7 | Flexibility and Efficiency | n/a | Limited room for this on a login form beyond autofocus/tab/Enter. |
| 8 | Aesthetic and Minimalist Design | 4 | Single-column card, no clutter, glow/blur restraint matches DESIGN.md's flat-by-default philosophy. |
| 9 | Error Recovery | 3 | Toasts are genuinely actionable (401→"Reset password", 409→"Sign in", expired token→"Request new link"); the one silent-failure gap is now fixed. |
| 10 | Help and Documentation | 1 | No support/help link anywhere in the flow — acceptable for login, but a locked-out user has nowhere else to go. |
| **Total** | | **29/32** | **Good (91%)** |

## Design Specificity Verdict

**LLM assessment**: Better than generic SaaS auth, but only just. The shared tagline in `auth-shell.tsx` — "Every revision tracked, every change reviewed." — is a real, product-specific differentiator now appearing on all four auth screens, and it's the single strongest specificity signal in the flow. Everything else is still interchangeable SaaS copy: "Welcome back," "Create your account," "Set up your workspace in under a minute," "Choose a new password" — none of the four page titles/subtitles reference documents, revisions, approvals, or reviewers. The `bg-grid`/`bg-scanlines` overlay and `animate-float` logo do carry the Signal Console visual identity forward. Net: identity is present at the shell level, thin at the content level.

**Deterministic scan**: `detect.mjs --json` across all four pages, `auth-shell.tsx`, and `validation.ts` returned **exit 0, zero findings** — clean.

**Visual overlays**: A dev server was reachable this time (`localhost:3000/login` → HTTP 200), but no browser-automation tool was connected in either assessment's session (the `claude-in-chrome` extension isn't set up), so live rendering/console evidence still couldn't be captured. This is a tooling gap, not a skipped step — connect the extension for a future run to get real visual overlays.

## A bug found and fixed during this critique pass

Assessment A caught a genuine regression I introduced in the harden pass: adding `noValidate` to suppress native browser validation bubbles removed the only feedback for an **empty** required field, since every inline-error condition was gated on `value !== ""` (only checking *format*, not *presence*). Result: clicking submit with an empty email/password/confirm field did nothing visible at all — no toast, no inline error, no state change — while the submit handler silently `return`ed before reaching the network call.

I verified this myself against the current code (not just trusting the report) and confirmed it affected all four forms: login (email), register (email, password), forgot-password (email), reset-password (password, confirm). Fixed live, in this same pass: every field's error condition now distinguishes "required" from "invalid format/length/match," so an empty touched field always shows a message. Also added the same treatment to register's Name field (previously ungated client-side) for consistency. Re-verified clean: `tsc --noEmit`, targeted `eslint`, and `detect.mjs` all pass after the fix.

## What's Working

- **Actionable error toasts, not raw messages** — login 401, register 409, and reset-password's expired-token case all attach a labeled action button that routes to the correct next step.
- **Privacy-preserving forgot-password copy** — the code explicitly documents *why* the UI shows the same confirmation regardless of whether the email exists, and the implementation matches that intent exactly.
- **Real inline validation wired to the design system's own error tokens** — `inputErrorClass` correctly swaps to `focus-console-error` and pairs with `aria-invalid`/`aria-describedby` on every validated field.

## Remaining Priority Issues

- **[P2] `primaryBtn` doesn't match DESIGN.md's own `button-primary` spec.** DESIGN.md specifies a solid signal-mint background with near-black text; the actual shared button is a 10%-opacity tint with an outline (`bg-signal-info/10 border border-signal-info/50 text-signal-info`) — reads as secondary/ghost rather than the one emphasized action per screen, which undercuts the system's own "One Signal Rule." **Fix**: align to spec — solid `bg-signal-info` with `text-console-950`. **Suggested command**: `/impeccable typeset` or a direct token fix.
- **[P3] Radius/fill drift from DESIGN.md tokens.** `inputClass`/`primaryBtn` use `rounded-md` (10px) where the spec calls for `lg` (12px) on both inputs and buttons; `inputClass` fills with `bg-console-900` where the `input-default` spec calls for transparent. Not flow-breaking, but measurable drift from the system's own source of truth. **Suggested command**: `/impeccable polish`.
- **[P3] Hint/error caption contrast is borderline.** `text-console-400` (`#6b6b6e` in dark mode) against `#000000` computes to roughly 4.4:1 on 12px text — just under WCAG AA's 4.5:1 floor. Affects every hint/tagline line across the app, not new to this flow. **Suggested command**: `/impeccable audit`.

## Persona Red Flags

**Sam (accessibility)**: Was the persona most exposed by the now-fixed silent-failure bug (no `role="alert"` announcement, no focus move, nothing, on an empty-field submit) — resolved. Still worth tracking the borderline hint-text contrast above.

**Riley (stress-tester)**: Mashing submit with blank fields, or opening `reset-password` with a stale bookmarked link, are both now handled explicitly (missing-token view, expired-token toast, and the just-fixed empty-field messaging).

## Minor Observations

- No password-visibility toggle on any of the three password fields — a small but common friction point when typing a new password twice.
- Register's subtitle ("Set up your workspace in under a minute") makes an unverified time claim, slightly at odds with a multi-tenant org/project product.
- `focus-console`/`focus-console-error` trigger on bare `:focus`, not `:focus-visible`, so mouse clicks also produce the glow ring — a pre-existing system-wide choice, not introduced here.
- Forgot-password never reveals whether an email is registered, but register's 409 conflict toast does reveal it directly — an intentional tradeoff (a returning user needs to know their email is taken) worth confirming is deliberate rather than an inconsistent threat model.

## Questions to Consider

- If the shared tagline is the only sentence in this flow that says "Kenoma," should the page titles themselves start referencing the review/revision workflow, or is a fully generic auth flow the right call to avoid confusing brand-new signups before they've seen the product?
- Was the tinted/outline primary button a deliberate "softer CTA" decision for auth specifically, or has it simply drifted from DESIGN.md's solid-fill spec?
