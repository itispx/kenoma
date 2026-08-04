# Kenoma frontend

Next.js (App Router) + TypeScript client for the Kenoma documentation module:
auth, the GitHub-style org switcher, project/document management, a TipTap
Markdown editor, and a redline-style reviewer view — all talking to the Go
backend in `../backend` over REST.

## Stack

- **Next.js 16** (App Router, Turbopack), **TypeScript**, **Tailwind CSS v4**
- **TipTap v3** + **tiptap-markdown** for the editor — the editor's internal
  state is TipTap/ProseMirror JSON, but every read from and write to the
  backend is a plain Markdown string (`editor.storage.markdown.getMarkdown()`
  / `content` accepting Markdown directly)
- No data-fetching library (React Query/SWR) — this app is a thin client over
  an external API, so plain `fetch` + a couple of small Zustand stores
  (session, active org) covers it

## Prerequisites

- Node 20+
- The backend running locally (see `../backend/README.md`) — this app has no
  server-side data layer of its own; every page is a client component that
  calls the Go API directly.

## Local setup

**Fastest path: `make up`.** From the repo root, `make up` starts this app
alongside the backend and Postgres, with hot-reload — see the root
`docker-compose.dev.yml`/`Makefile`. Note it runs `next dev
--webpack` rather than the Turbopack default: Turbopack currently crash-loops
against a Docker bind-mounted source tree (a known rough edge, not a bug in
this app) — native `npm run dev` below is unaffected and uses Turbopack
normally.

**Running natively instead:**

```bash
npm install
cp ../.env.example ../.env   # root .env, shared with the backend; adjust NEXT_PUBLIC_API_URL as needed
npm run dev
```

Then open `http://localhost:3000`. Register an account, create an
organization (or work in your personal space), create a project, and go.

## Environment variables

Loaded from the repo-root `.env` (not `frontend/.env.local`) via
`next.config.ts` (`@next/env`'s `loadEnvConfig`), shared with the backend —
see `../.env.example`.

- `NEXT_PUBLIC_API_URL` — base URL of the backend API, **including** the
  `/api/v1` prefix (e.g. `http://localhost:8080/api/v1`). Public (prefixed
  `NEXT_PUBLIC_`) because the browser calls the API directly — there's no
  Next.js server-side proxy in front of it.

## Architecture

```
/app
  layout.tsx              root layout: theming + toaster, no provider tree needed for state
  page.tsx                 redirects to /dashboard or /login based on auth state
  /login, /register         public auth pages
  /(app)                    route group for everything that requires a session
    layout.tsx               RequireAuth gate + shared Header (org switcher, user menu)
    /dashboard                project list scoped to the active org/personal context
    /orgs/new, /orgs/[orgId]  create org; org settings (members, roles, invites)
    /projects/new             create project (owner dropdown: personal or any org)
    /projects/[projectId]      document list, permission grid (org admins), import entry
    /projects/[projectId]/import   docx upload, new-doc or new-revision
    /documents/[documentId]    editor (autosave, submit for review) or "start editing"
    /documents/[documentId]/history          revision list
    /documents/[documentId]/review/[revisionId]  diff view, comments, approve/reject/request-changes
    /invitations/accept       accepts an org invitation by token (?token=... query param)
/components                 shared UI: Header, OrgSwitcher, RequireAuth, MarkdownEditor, DiffView, ProjectPermissionsPanel
/lib
  api.ts                    fetch wrapper: injects Authorization + X-Active-Org-Id,
                             silent-refreshes and retries once on a 401
  auth-store.ts              useAuthStore/useAuth (Zustand) — session state, resumes from
                             the httpOnly refresh cookie on page load
  org-store.ts               useOrgStore/useActiveOrg (Zustand) — the org switcher's state,
                             persisted in localStorage
  use-project-permissions.ts usePermissions-style hook backing permission-aware UI
  types.ts                   TypeScript mirrors of the backend's JSON DTOs
```

## Session handling, precisely

The access token lives **only in memory** (a module-level variable in
`lib/api.ts`, mirrored into `AuthProvider`'s React state) — never
`localStorage`, to keep it out of reach of an XSS payload reading storage.
The refresh token is an httpOnly cookie the browser never exposes to JS at
all; `AuthProvider` calls `POST /auth/refresh` once on mount to silently
resume a session after a page reload, and `lib/api.ts` does the same
automatically whenever any request gets a 401, retrying that request once
before giving up and redirecting to `/login`.

## Permission-aware UI

`useProjectPermissions(projectId)` fetches
`GET /projects/:id/my-permissions` and exposes a `has(key)` check used to
hide/disable actions (submit, review, approve, export, manage) the current
user can't perform. This is a UX nicety only — **the backend is the actual
authorization boundary** and re-checks every mutating request regardless of
what this hook says; a stale permission list here just means the button
shows but the request 403s.

## Design decisions / simplifications (flagged)

- **Diff rendering is text-level, not rich-HTML.** `DiffView` renders each
  go-diff op as an inline `<ins>`/`<del>`/plain span over the raw Markdown
  source, rather than re-rendering the diff as formatted rich text. A
  rich-rendered redline would require slicing Markdown at diff-op boundaries
  that don't always land on Markdown syntax boundaries (e.g. splitting
  `**bold**` mid-token) — risking silently broken rendering. The chosen
  approach is less visually polished but never corrupts the underlying
  content; see the comment in `components/DiffView.tsx`.
- **Org-level vs. project-level permission management is split across two
  pages** by necessity: `/orgs/[orgId]` manages the base `admin`/`member`
  role and invites; `/projects/[projectId]` manages granular
  `docs:*` grants, since those are inherently per-project. There's no single
  "permissions" page that shows both.
- **No optimistic UI.** Every mutation (grant/revoke, approve/reject,
  autosave) waits for the backend response before updating local state, kept
  simple on purpose given the scope of this pass.
