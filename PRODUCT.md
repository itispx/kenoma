# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

General documentation teams — not tied to one industry or one parent
company. Any organization (or an individual working in a personal space)
that needs structured document drafting, review, and approval: an org has
projects, projects hold documents, documents move through
draft → in-review → approved via an explicit workflow with named
reviewers/approvers, rather than ad hoc email or chat.

## Product Purpose

Kenoma gives a team a single place to import a Word document, edit it
collaboratively, submit it for review, and get it approved with a full,
inspectable record of what changed — then export the approved result back
to docx/PDF. Success is a document's lifecycle (who wrote what, who
reviewed it, what changed between versions, who signed off) being fully
reconstructable after the fact, without relying on emailed drafts or
tracked-changes files passed hand to hand.

## Positioning

Every revision is immutable once it leaves draft, and the diff between any
two revisions is a redline computed on demand from that immutable pair —
not a mutable tracked-changes blob that can be edited after review, and not
a stored diff that can go stale. Combined with per-project granular
permissions (import/edit/submit/review/approve/export/manage as separate
grants), this gives a defensible, always-accurate audit trail of a
document's approval history that a general editor (Google Docs, Confluence)
or a plain emailed-redline workflow doesn't provide by default.

## Operating Context

- Multi-tenant: shared tables, every tenant-scoped row carries
  `organization_id` (nullable — null means a personal/standalone project)
  and/or `project_id`.
- Core workflow: register → create org (or work personally) → create
  project → import a docx (new document or new revision of an existing one)
  → edit draft (autosave) → submit for review → reviewers comment/request
  changes → approver approves or rejects → export approved revision as
  docx/PDF.
- Org-level roles (`admin`/`member`) are managed separately from
  project-level granular `docs:*` permission grants — these are two
  different pages/concerns, not one settings surface.
- The frontend sends `X-Active-Org-Id` to scope which projects/context show
  up, but every mutating action is re-authorized server-side regardless of
  what the client claims.

## Capabilities and Constraints

- Docx import/export via Pandoc; Markdown is the internal source of truth
  for editing (TipTap editor reads/writes Markdown strings).
- Diff rendering is intentionally text-level (inline ins/del/plain spans
  over raw Markdown), not rich-HTML, to avoid corrupting content by
  splitting Markdown syntax mid-token at a diff boundary.
- No optimistic UI — every mutation waits for the backend response.
- Conversions and reviews run synchronously in the request today (no
  background job queue yet); acceptable at current scale.
- No rate limiting on auth endpoints yet.
- Terminology: "organization" (org) → "project" → "document" → "revision"
  (draft / in_review / approved states) → "comment" (with a diff anchor) →
  "permission grant" (`docs:import`, `docs:edit`, `docs:submit_review`,
  `docs:review`, `docs:approve`, `docs:export`, `docs:manage_comments`,
  `docs:manage`).

## Brand Commitments

Internal/self-contained tool named "Kenoma" — no external parent-company
brand, terminology, or compliance constraints to preserve. The existing
logo mark and console/terminal-glow visual identity in the repo are the
current visual world, not a fixed brand mandate; they are open to
evolution via `/impeccable document` or `new-work`, not locked in here as
product truth.

## Evidence on Hand

No real customer documents, testimonials, case studies, or press exist yet.
Future design/content work must not fabricate sample org names, customer
logos, or testimonials — use clearly-labeled placeholder content instead.

## Product Principles

1. Immutability and on-demand diffing over convenience: never let a
   reviewed revision's content change after the fact, even if that means
   recomputing diffs on every page load.
2. Server-side authorization is the only real boundary; client-side
   permission checks exist purely to keep the UI honest, never as the
   enforcement point.
3. Docx round-tripping must never silently corrupt content — prefer a
   plainer redline over a prettier one that risks breaking Markdown syntax.
4. Horizontal, not vertical: don't bake in assumptions specific to one
   industry, company, or document type (legal, policy, etc.) since the
   product targets general documentation teams.
5. Ship workflows in full before polish — e.g. background job queues for
   conversions/reviews are a known, explicitly deferred improvement, not an
   oversight to hide.
