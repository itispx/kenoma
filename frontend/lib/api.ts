// Thin fetch wrapper around the Go backend. Handles auth header injection and
// one silent-refresh-and-retry on a 401 so a merely-expired access token
// doesn't bounce the user to /login mid-session.
"use client";

import type {
  ApiEnvelope,
  AuthResponse,
  ChangeRequestDetail,
  ChangeRequestSummary,
  ChangeLog,
  CRComment,
  DiffSpan,
  Doc,
  DocSummary,
  Invitation,
  Organization,
  OrgMember,
  OrgRole,
  Permission,
  PermissionGrant,
  PermissionKey,
  Project,
  Revision,
  RevisionSummary,
  Workstream,
  WorkstreamSummary,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// --- Module-level session state -------------------------------------------
// A plain module variable (not React state) so every request sees the current
// token without needing the whole component tree wired through context just to
// make a request. The auth store is the source of truth and mirrors its state
// in here; components read the *user* via useAuth(), not this.

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// Fired when a request's refresh-and-retry also fails, meaning the session is
// truly gone (refresh cookie expired/revoked). The auth store listens for this
// to clear its state, decoupling api.ts from the store module (avoids a
// circular import).
const UNAUTHENTICATED_EVENT = "kenoma:unauthenticated";
export function onUnauthenticated(cb: () => void) {
  window.addEventListener(UNAUTHENTICATED_EVENT, cb);
  return () => window.removeEventListener(UNAUTHENTICATED_EVENT, cb);
}
function emitUnauthenticated() {
  window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
}

async function rawRefresh(): Promise<AuthResponse | null> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as ApiEnvelope<AuthResponse>;
  if (!body.data) return null;
  accessToken = body.data.access_token;
  return body.data;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown; // JSON-serialized
  skipAuthRetry?: boolean;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, skipAuthRetry, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (accessToken) {
    finalHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && !skipAuthRetry && path !== "/auth/refresh") {
    const refreshed = await rawRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
    accessToken = null;
    emitUnauthenticated();
    throw new ApiError(401, "session expired");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    return undefined as T;
  }

  // Unwrap the backend's envelope: { status, data } on success,
  // { status, error: { message } } on failure. Callers get the payload only.
  const parsed = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok) {
    throw new ApiError(res.status, parsed.error?.message ?? res.statusText);
  }
  return parsed.data as T;
}

// requestForm uploads a multipart file (docx imports). The Content-Type
// header must stay unset: the browser fills it in together with the multipart
// boundary, and a hand-written value would break parsing server-side.
async function requestForm<T>(
  path: string,
  field: string,
  file: File,
): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: form,
  });
  if (res.status === 401) {
    const refreshed = await rawRefresh();
    if (refreshed) {
      return requestForm<T>(path, field, file);
    }
    accessToken = null;
    emitUnauthenticated();
    throw new ApiError(401, "session expired");
  }
  const parsed = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok) {
    throw new ApiError(res.status, parsed.error?.message ?? res.statusText);
  }
  return parsed.data as T;
}

// download fetches a binary payload (revision exports) and returns it as a
// Blob plus the filename the server suggested via Content-Disposition. Same
// auth header and one-retry-on-401 behavior as request(), but no JSON
// envelope: the file is the whole response.
async function download(
  path: string,
): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    credentials: "include",
  });
  if (res.status === 401) {
    const refreshed = await rawRefresh();
    if (refreshed) {
      return download(path);
    }
    accessToken = null;
    emitUnauthenticated();
    throw new ApiError(401, "session expired");
  }
  if (!res.ok) {
    // The backend still speaks the JSON envelope for failures, even on the
    // download route, so parse it for the message rather than guessing.
    const parsed = (await res.json().catch(() => null)) as ApiEnvelope<never> | null;
    throw new ApiError(res.status, parsed?.error?.message ?? res.statusText);
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(
    res.headers.get("content-disposition") ?? "",
  );
  return { blob, filename: match?.[1] ?? "document" };
}

// --- Auth ------------------------------------------------------------------

export const auth = {
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: { email, password, name },
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  refresh: () => rawRefresh(),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  requestPasswordReset: (email: string) =>
    request<{ message: string }>("/auth/password-reset/request", {
      method: "POST",
      body: { email },
    }),
  confirmPasswordReset: (token: string, password: string) =>
    request<void>("/auth/password-reset/confirm", {
      method: "POST",
      body: { token, password },
    }),
};

const q = (value: string) => encodeURIComponent(value);
const requestSpans = (path: string) =>
  request<{ spans: DiffSpan[] }>(path).then((response) => response.spans);

export const orgs = {
  list: () => request<Organization[]>("/orgs"),
  create: (name: string) =>
    request<Organization>("/orgs", { method: "POST", body: { name } }),
  get: (id: string) => request<Organization>(`/orgs/${q(id)}`),
  update: (
    id: string,
    patch: { name?: string; members_can_invite?: boolean },
  ) =>
    request<Organization>(`/orgs/${q(id)}`, { method: "PATCH", body: patch }),
  remove: (id: string) => request<void>(`/orgs/${q(id)}`, { method: "DELETE" }),
  restore: (id: string) =>
    request<void>(`/orgs/${q(id)}/restore`, { method: "POST" }),
  listMembers: (id: string) => request<OrgMember[]>(`/orgs/${q(id)}/members`),
  updateMemberRole: (id: string, memberId: string, role: OrgRole) =>
    request<{ id: string; role: OrgRole }>(
      `/orgs/${q(id)}/members/${q(memberId)}`,
      { method: "PATCH", body: { role } },
    ),
  removeMember: (id: string, memberId: string) =>
    request<void>(`/orgs/${q(id)}/members/${q(memberId)}`, {
      method: "DELETE",
    }),
  listInvitations: (id: string) =>
    request<Invitation[]>(`/orgs/${q(id)}/invitations`),
  invite: (id: string, email: string, role: OrgRole) =>
    request<Invitation>(`/orgs/${q(id)}/invitations`, {
      method: "POST",
      body: { email, role },
    }),
  revokeInvitation: (id: string, invitationId: string) =>
    request<void>(`/orgs/${q(id)}/invitations/${q(invitationId)}`, {
      method: "DELETE",
    }),
  acceptInvitation: (token: string) =>
    request<Organization>("/invitations/accept", {
      method: "POST",
      body: { token },
    }),
};
export const projects = {
  listForOrg: (id: string) => request<Project[]>(`/orgs/${q(id)}/projects`),
  // Soft-deleted projects, for org admins restoring one that was taken out.
  listDeletedForOrg: (id: string) =>
    request<Project[]>(`/orgs/${q(id)}/projects/deleted`),
  create: (id: string, name: string) =>
    request<Project>(`/orgs/${q(id)}/projects`, {
      method: "POST",
      body: { name },
    }),
  get: (id: string) => request<Project>(`/projects/${q(id)}`),
  rename: (id: string, name: string) =>
    request<Project>(`/projects/${q(id)}`, { method: "PATCH", body: { name } }),
  remove: (id: string) =>
    request<void>(`/projects/${q(id)}`, { method: "DELETE" }),
  restore: (id: string) =>
    request<void>(`/projects/${q(id)}/restore`, { method: "POST" }),
  myPermissions: (id: string) =>
    request<PermissionKey[]>(`/projects/${q(id)}/my-permissions`),
};
export const documents = {
  listForProject: (projectId: string) =>
    request<DocSummary[]>(`/projects/${q(projectId)}/documents`),
  // Soft-deleted documents, for managers restoring a row that was taken out.
  listDeletedForProject: (projectId: string) =>
    request<DocSummary[]>(`/projects/${q(projectId)}/documents/deleted`),
  create: (projectId: string, title: string) =>
    request<Doc>(`/projects/${q(projectId)}/documents`, {
      method: "POST",
      body: { title },
    }),
  get: (id: string) => request<Doc>(`/documents/${q(id)}`),
  saveInitialVersion: (
    id: string,
    draft: { title: string; content_markdown: string },
  ) =>
    request<Doc>(`/documents/${q(id)}/initial-version`, {
      method: "POST",
      body: draft,
    }),
  // Imports a docx as a brand new document; its converted Markdown becomes
  // revision 1 of main directly.
  importNew: (projectId: string, file: File) =>
    requestForm<Doc>(`/projects/${q(projectId)}/documents/import`, "file", file),
  // Imports a docx as a proposed new version: opens an import Change Request.
  importRevision: (documentId: string, file: File) =>
    requestForm<ChangeRequestDetail>(
      `/documents/${q(documentId)}/import`,
      "file",
      file,
    ),
  remove: (id: string) =>
    request<void>(`/documents/${q(id)}`, { method: "DELETE" }),
  restore: (id: string) =>
    request<void>(`/documents/${q(id)}/restore`, { method: "POST" }),
  revisions: {
    list: (documentId: string) =>
      request<RevisionSummary[]>(`/documents/${q(documentId)}/revisions`),
    get: (documentId: string, revisionId: string) =>
      request<Revision>(
        `/documents/${q(documentId)}/revisions/${q(revisionId)}`,
      ),
    diff: (documentId: string, fromRevisionId: string, toRevisionId: string) =>
      requestSpans(
        `/documents/${q(documentId)}/diff?from=${q(fromRevisionId)}&to=${q(toRevisionId)}`,
      ),
    export: (documentId: string, revisionId: string, format: "docx" | "pdf") =>
      download(
        `/documents/${q(documentId)}/revisions/${q(revisionId)}/export?format=${format}`,
      ),
  },
};

export const changeRequests = {
  open: (
    documentId: string,
    proposal: {
      workstream_id: string;
      expected_latest_change_log_id: string;
    },
  ) =>
    request<ChangeRequestDetail>(
      `/documents/${q(documentId)}/change-requests`,
      { method: "POST", body: proposal },
    ),
  listForDocument: (documentId: string) =>
    request<ChangeRequestSummary[]>(
      `/documents/${q(documentId)}/change-requests`,
    ),
  get: (id: string) => request<ChangeRequestDetail>(`/change-requests/${q(id)}`),
  merge: (
    id: string,
    resolution?: { resolved_title?: string; resolved_content_markdown?: string },
  ) =>
    request<ChangeRequestDetail & { created_rev_seq: number }>(
      `/change-requests/${q(id)}/merge`,
      { method: "POST", body: resolution ?? {} },
    ),
  close: (id: string, note = "") =>
    request<ChangeRequestDetail>(`/change-requests/${q(id)}/close`, {
      method: "POST",
      body: { note },
    }),
  diff: (id: string, side: "branch" | "main") =>
    requestSpans(`/change-requests/${q(id)}/diff?side=${side}`),
  changeLogs: {
    list: (id: string) =>
      request<ChangeLog[]>(`/change-requests/${q(id)}/change-logs`),
    diff: (id: string, changeLogId: string) =>
      requestSpans(
        `/change-requests/${q(id)}/change-logs/${q(changeLogId)}/diff`,
      ),
  },
  comments: {
    list: (id: string) =>
      request<CRComment[]>(`/change-requests/${q(id)}/comments`),
    add: (
      id: string,
      body: string,
      opts?: { parent_id?: string; op_index?: number; op_end_index?: number },
    ) =>
      request<CRComment>(`/change-requests/${q(id)}/comments`, {
        method: "POST",
        body: { body, ...opts },
      }),
    remove: (crId: string, commentId: string) =>
      request<void>(
        `/change-requests/${q(crId)}/comments/${q(commentId)}`,
        { method: "DELETE" },
      ),
  },
};
export const workstreams = {
  list: (documentId: string) =>
    request<WorkstreamSummary[]>(`/documents/${q(documentId)}/workstreams`),
  get: (documentId: string, workstreamId: string) =>
    request<Workstream>(
      `/documents/${q(documentId)}/workstreams/${q(workstreamId)}`,
    ),
  create: (documentId: string, name: string, baseRevisionId: string) =>
    request<Workstream>(`/documents/${q(documentId)}/workstreams`, {
      method: "POST",
      body: { name, base_revision_id: baseRevisionId },
    }),
  append: (
    documentId: string,
    workstreamId: string,
    input: {
      expected_parent_change_log_id?: string;
      message: string;
      title: string;
      content_markdown: string;
    },
  ) =>
    request<ChangeLog>(
      `/documents/${q(documentId)}/workstreams/${q(workstreamId)}/change-logs`,
      { method: "POST", body: input },
    ),
  diff: (documentId: string, workstreamId: string, changeLogId?: string) =>
    requestSpans(
      `/documents/${q(documentId)}/workstreams/${q(workstreamId)}/diff${
        changeLogId ? `?change_log_id=${q(changeLogId)}` : ""
      }`,
    ),
  reconcileDiff: (documentId: string, workstreamId: string, contentMarkdown: string) =>
    request<{ spans: DiffSpan[] }>(
      `/documents/${q(documentId)}/workstreams/${q(workstreamId)}/reconcile-diff`,
      { method: "POST", body: { content_markdown: contentMarkdown } },
    ).then((response) => response.spans),
  abandon: (documentId: string, workstreamId: string) =>
    request<void>(
      `/documents/${q(documentId)}/workstreams/${q(workstreamId)}`,
      { method: "DELETE" },
    ),
};
export const permissions = {
  catalog: () => request<Permission[]>("/permissions"),
};
export const grants = {
  list: (id: string) =>
    request<PermissionGrant[]>(`/projects/${q(id)}/permissions`),
  grant: (id: string, userId: string, permissionKey: PermissionKey) =>
    request<void>(`/projects/${q(id)}/permissions`, {
      method: "POST",
      body: { user_id: userId, permission_key: permissionKey },
    }),
  revoke: (id: string, userId: string, permissionKey: PermissionKey) =>
    request<void>(
      `/projects/${q(id)}/permissions?user_id=${q(userId)}&permission_key=${q(permissionKey)}`,
      { method: "DELETE" },
    ),
};
