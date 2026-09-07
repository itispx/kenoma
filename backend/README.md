# Kenoma backend

Go API (standard library `net/http` only — no web framework) for the Kenoma
documentation module: multi-tenant orgs/projects, JWT auth, granular
per-project permissions, a Word-document import pipeline, an
immutable-revision review workflow with redline diffs, and docx/PDF export.

## Stack

- **Go** + stdlib **net/http** (Go 1.22+'s enhanced `http.ServeMux` — method-
  prefixed patterns and `{param}` path wildcards — covers all routing; no
  Gin/Echo/chi). A small self-written grouping helper
  (`internal/handlers/router.go`) is the only routing scaffolding, needed
  because `http.ServeMux` has no built-in concept of a prefixed sub-group.
  Request validation is manual (`internal/handlers/validate.go`) rather than
  struct tags — no validation library either.
- **PostgreSQL** (Neon in production), accessed via **pgx/v5** with SQL
  written by hand and turned into typed Go by **sqlc**
- **goose** for versioned migrations
- **Pandoc** (subprocess) for docx <-> Markdown <-> PDF conversion
- **sergi/go-diff** (diff-match-patch) for redline diffs, semantic-cleanup pass
- JWT access tokens + opaque, hashed, rotating refresh tokens
- In-memory per-IP rate limiting on the public auth endpoints (register,
  login, refresh, logout, password reset) — see `AUTH_RATE_LIMIT`/
  `AUTH_RATE_WINDOW`/`TRUST_PROXY` in `../.env.example`

## Prerequisites

- Go 1.22+ (enhanced ServeMux routing)
- A Postgres instance (local Docker container is fine for dev)
- [Pandoc](https://pandoc.org/installing.html) on PATH or pointed to via
  `PANDOC_PATH`
- A PDF engine Pandoc can shell out to for PDF export — pandoc's own default
  (`pdflatex`) isn't installed anywhere by default. Recommended:
  [tectonic](https://tectonic-typesetting.github.io/) (single static binary,
  ARM-friendly) or `typst`/`wkhtmltopdf`/`weasyprint`. Set `PANDOC_PDF_ENGINE`
  to whichever you install. Docx export and Markdown import work without a PDF
  engine — only `/revisions/:id/export/pdf` needs one.

## Local setup

**Fastest path: `make up`.** From the repo root, `make up` starts Postgres and
this API with hot-reload (via [air](https://github.com/air-verse/air)) —
Pandoc and a PDF engine (typst) are already baked into the dev image, so
import/export work immediately with no host setup at all. See the root
`docker-compose.dev.yml`/`Makefile` and their comments for details; this is
the recommended way to run the whole stack (backend + frontend + infra) while
developing. `make down` stops it.

Migrations don't run as part of the stack — run them explicitly (first-time
setup, or after pulling new migration files) with `make db-up` (applies all
pending migrations) or `make db-down` (rolls back one). Each spins up a
throwaway container just for that command and removes it once done; postgres
must already be running via `make up`.

The backend only runs in containers — `DATABASE_URL` in `.env` points at the
`postgres` docker-compose service hostname, which only resolves inside that
network, so there's no supported way to run the API or `goose`/`sqlc`
directly on the host anymore.

The server listens on `:$PORT` (default `8080`) and logs every registered
route on startup. `GET /healthz` is unauthenticated and just checks the
process is up (it does not currently ping the DB).

See `docs/requests.http` for a walk-through of the full flow (register → org →
project → document → draft → submit → review → approve → export) using the
VS Code "REST Client" extension or IntelliJ's HTTP client.

## Environment variables

Loaded from the repo-root `.env` (not `backend/.env`) — see `../.env.example`
for the full list with defaults/reasoning, shared with the frontend's
`NEXT_PUBLIC_API_URL`. The required ones (no default, server refuses to start
without them): `DATABASE_URL`, `JWT_ACCESS_SECRET`.

## Migrations

Goose migrations live in `migrations/*.sql`, applied in filename order.
`make db-up`/`make db-down` (repo root) apply all pending / roll back one,
each via a throwaway container on the `kenoma-dev` network — see the root
`Makefile`. For commands the Makefile doesn't wrap (`status`, `create`), run
goose the same way by hand (with `DATABASE_URL` exported from `.env` into
your shell, e.g. `set -a && source ../.env && set +a`):

```bash
docker run --rm --network kenoma-dev \
  -v "$(pwd)/migrations:/app/migrations" \
  kenoma-migrate:dev -dir migrations postgres "$DATABASE_URL" status

docker run --rm \
  -v "$(pwd)/migrations:/app/migrations" \
  kenoma-migrate:dev -dir migrations create <name> sql
```

Migration `00003` seeds the `permissions` lookup table — see "Permission
model" below for the exact key list and reasoning.

## Architecture

```
/cmd/api            entrypoint: loads config, connects to DB, wires services, starts the http.Server
/internal
  /config           env var loading/validation
  /httpx             stdlib request/response helpers (WriteJSON, DecodeJSON, ServeFileAttachment)
  /middleware        RequireAuth (JWT) — a func(http.HandlerFunc) http.HandlerFunc
  /models            PermissionKey constants, shared DTOs/error shape
  /handlers          one file per resource; Server struct carries all deps;
                     router.go is the http.ServeMux grouping helper, validate.go the manual field checks
  /services
    /auth            bcrypt password hashing, JWT issue/parse
    /tokenutil        opaque random token generation + hashing (refresh tokens, invitations)
    /permissions      the org-admin/personal-owner/explicit-grant resolution logic
    /convert          Pandoc, behind the DocumentConverter interface
    /diffsvc          go-diff wrapper + diff-anchor build/verify
    /email            EmailService interface + a console-logging stub impl
/db
  /queries           hand-written SQL, source of truth for sqlc
  /sqlc              generated Go (checked in; regenerate with `sqlc generate`)
/migrations          goose SQL migrations
```

`convert.DocumentConverter` and
`email.Service` are all interfaces specifically so that submitting a
long-running conversion or send could later be handed to a background job
queue (e.g. Asynq) without touching any handler code — see constraint #12 in
the original spec. Right now everything runs inline/synchronously in the
request, which is fine at this scale but would need to move to a queue before
handling large documents or high import volume in production.

## Multi-tenancy & permission model

Shared tables, not schema-per-tenant: every tenant-scoped row carries
`organization_id` (nullable — null means a personal/standalone project) and/or
`project_id`. **Every query that touches tenant data is expected to filter by
one of these** — see `internal/services/permissions/checker.go` for the one
place this is centralized and enforced for the "can user X do action Y on
project Z" question.

Resolution order (`permissions.Checker.HasPermission`):
1. Personal project (`organization_id IS NULL`) → only the `owner_id` passes.
2. Org project, caller is an org `admin` → always passes (admins have all
   permissions on all of an org's projects implicitly).
3. Org project, caller is an org `member` → passes only if a matching row
   exists in `project_member_permissions`.
4. Not a member of the org at all → fails.

The frontend is expected to send `X-Active-Org-Id` on every request once the
user has switched into an org context (empty/absent = personal space). The
backend **never trusts this as an authorization signal on its own** — it's
only used to scope *listing* (which projects show up), and every mutating
action re-derives the caller's actual membership/permissions from the
database on that request, ignoring whatever the header claims.

### Permission key list (flagged assumption)

Seeded by migration `00003`:

| Key | Covers |
|---|---|
| `docs:import` | Upload a docx |
| `docs:edit` | Edit draft content, autosave |
| `docs:submit_review` | Lock a draft and send it to review |
| `docs:review` | Comment on / request changes to an in-review revision |
| `docs:approve` | Approve or reject an in-review revision |
| `docs:export` | Export an approved revision (docx/PDF) |
| `docs:manage_comments` | Resolve or delete *other users'* comments |
| `docs:manage` | Project-level admin: delete documents/projects, grant/revoke other members' permissions on this project |

This is a judgment call, not something pinned down by the spec. Reasoning:
each key maps to exactly one action in the feature list so a grant is never
"more than the admin meant to give"; `docs:manage_comments` is split from
`docs:review` because moderating comments and substantively reviewing content
are different trust levels someone might hold independently; `docs:manage` is
scoped to *one project* (unlike org `admin`, which is global) so an org admin
can delegate project administration without making someone a full org admin.
If this doesn't match how you want to carve up responsibilities, it's a
one-migration change (edit the seed rows in `00003`, add/remove
`models.PermissionKey` constants, adjust the handlers that reference them).

## Diff anchoring (flagged assumption)

`comments.diff_anchor` is a JSON blob: `{"diff_op_index": <int>, "context_hash":
"<sha256 of the op's text plus ~20 chars on either side>"}`, not a character
offset. Reasoning: revisions are immutable, so the diff between any two given
revisions never changes — the anchor only has to keep pointing at the same
diff *op* in that stable sequence, not survive concurrent edits (there aren't
any to survive). `context_hash` is a integrity check, not a security
boundary: it'd only ever mismatch if the diff algorithm's output changed
out from under an existing comment (e.g. a go-diff version bump), which
`VerifyAnchor` (in `internal/services/diffsvc`) can detect if you want to
surface "this comment's context has shifted" in the UI — not currently wired
into any handler, since nothing produces that mismatch today.

The diff itself is **computed on demand**, not stored: `GET
/revisions/:id/diff` recomputes it from the two immutable revisions' content
every time. This trades a small amount of CPU on each reviewer page load for
never having a stored diff go stale or need invalidation.

## Revision immutability, precisely

"Revisions are immutable" really means: once a revision leaves `draft` status
(i.e. `SubmitRevisionForReview` flips it to `in_review`), no handler ever
updates its `content` again. A `draft` row *is* mutable in place —
`PATCH /documents/:id/draft` (autosave) updates the same row repeatedly rather
than inserting a new revision per keystroke/interval, which would make the
history table meaningless as an audit trail. A partial unique index
(migration `00008`) enforces at most one `draft`/`in_review` revision per
document at a time, so autosave/submit can't race into two concurrently-open
revisions for the same document.

`request-changes` reuses the `draft` status rather than adding a fifth
`revision_status` value — see the comment on `handleRequestChanges` in
`internal/handlers/review.go` for the reasoning; this is a flagged judgment
call since the spec names the action without pinning down its resulting
state.

## Known limitations / not done in this pass

- Conversions and external API calls run synchronously in the request; see
  "Architecture" above re: moving to a background queue for scale.
- No automated test suite yet — see the "Verification" section of the
  original build plan for the manual walkthrough this was validated against
  (also captured in `docs/requests.http`).
