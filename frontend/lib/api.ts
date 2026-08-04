// Thin fetch wrapper around the Go backend. Handles auth header injection,
// the X-Active-Org-Id active-context header, and one silent-refresh-and-retry
// on a 401 so a merely-expired access token doesn't bounce the user to
// /login mid-session.
"use client";

import type {
  ApiErrorBody,
  AuthResponse,
  Comment,
  Document,
  DiffResponse,
  ImportResult,
  Invitation,
  OrgMember,
  Organization,
  Permission,
  PermissionKey,
  Project,
  ProjectPermissionGrant,
  Revision,
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
// A plain module variable (not React state) so every apiFetch call sees the
// current token without needing the whole component tree wired through
// context just to make a request. AuthProvider is the source of truth and
// mirrors its state in here; components read the *user* via useAuth(), not
// this.

let accessToken: string | null = null;
let activeOrgId: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setActiveOrgId(orgId: string | null) {
  activeOrgId = orgId;
}

// Fired when a request's refresh-and-retry also fails, meaning the session is
// truly gone (refresh cookie expired/revoked). AuthProvider listens for this
// to clear its state and redirect to /login, decoupling api.ts from the auth
// context module (avoids a circular import).
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
  const body = (await res.json()) as AuthResponse;
  accessToken = body.access_token;
  return body;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown; // JSON-serialized unless it's already FormData
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuthRetry, headers, ...rest } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;

  const finalHeaders = new Headers(headers);
  if (!isForm && body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (accessToken) {
    finalHeaders.set("Authorization", `Bearer ${accessToken}`);
  }
  if (activeOrgId) {
    finalHeaders.set("X-Active-Org-Id", activeOrgId);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: "include",
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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

  const parsed = await res.json();
  if (!res.ok) {
    const errBody = parsed as ApiErrorBody;
    throw new ApiError(res.status, errBody.error ?? res.statusText);
  }
  return parsed as T;
}

// --- Auth ------------------------------------------------------------------

export const auth = {
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: { email, password, name } }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }),
  refresh: () => rawRefresh(),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  requestPasswordReset: (email: string) =>
    request<{ message: string }>("/auth/password-reset/request", { method: "POST", body: { email } }),
  confirmPasswordReset: (token: string, password: string) =>
    request<void>("/auth/password-reset/confirm", { method: "POST", body: { token, password } }),
};

// --- Organizations -----------------------------------------------------------

export const orgs = {
  list: () => request<Organization[]>("/orgs"),
  create: (name: string) => request<Organization>("/orgs", { method: "POST", body: { name } }),
  listMembers: (orgId: string) => request<OrgMember[]>(`/orgs/${orgId}/members`),
  invite: (orgId: string, email: string) =>
    request<Invitation>(`/orgs/${orgId}/invitations`, { method: "POST", body: { email } }),
  revokeInvitation: (orgId: string, invitationId: string) =>
    request<void>(`/orgs/${orgId}/invitations/${invitationId}`, { method: "DELETE" }),
  acceptInvitation: (token: string) =>
    request<OrgMember>("/invitations/accept", { method: "POST", body: { token } }),
  removeMember: (orgId: string, memberId: string) =>
    request<void>(`/orgs/${orgId}/members/${memberId}`, { method: "DELETE" }),
  updateMemberRole: (orgId: string, memberId: string, role: "admin" | "member") =>
    request<{ id: string; role: string }>(`/orgs/${orgId}/members/${memberId}`, {
      method: "PATCH",
      body: { role },
    }),
};

// --- Projects ----------------------------------------------------------------

export const projects = {
  list: () => request<Project[]>("/projects"),
  create: (name: string, organizationId?: string | null) =>
    request<Project>("/projects", {
      method: "POST",
      body: { name, organization_id: organizationId || undefined },
    }),
  get: (projectId: string) => request<Project>(`/projects/${projectId}`),
  remove: (projectId: string) => request<void>(`/projects/${projectId}`, { method: "DELETE" }),
  myPermissions: (projectId: string) =>
    request<PermissionKey[]>(`/projects/${projectId}/my-permissions`),
};

export const permissionsApi = {
  listAll: () => request<Permission[]>("/permissions"),
  listGrants: (projectId: string) =>
    request<ProjectPermissionGrant[]>(`/projects/${projectId}/permissions`),
  grant: (projectId: string, organizationMemberId: string, permissionKey: PermissionKey) =>
    request<ProjectPermissionGrant>(`/projects/${projectId}/permissions`, {
      method: "POST",
      body: { organization_member_id: organizationMemberId, permission_key: permissionKey },
    }),
  revoke: (projectId: string, organizationMemberId: string, permissionKey: PermissionKey) =>
    request<void>(
      `/projects/${projectId}/permissions?organization_member_id=${organizationMemberId}&permission_key=${permissionKey}`,
      { method: "DELETE" }
    ),
};

// --- Documents / revisions -----------------------------------------------------

export const documents = {
  list: (projectId: string) => request<Document[]>(`/projects/${projectId}/documents`),
  create: (projectId: string, title: string) =>
    request<Document>(`/projects/${projectId}/documents`, { method: "POST", body: { title } }),
  get: (documentId: string) => request<Document>(`/documents/${documentId}`),
  updateTitle: (documentId: string, title: string) =>
    request<Document>(`/documents/${documentId}`, { method: "PATCH", body: { title } }),
  remove: (documentId: string) => request<void>(`/documents/${documentId}`, { method: "DELETE" }),
  history: (documentId: string) => request<Revision[]>(`/documents/${documentId}/revisions`),
  getDraft: (documentId: string) => request<Revision>(`/documents/${documentId}/draft`),
  createDraft: (documentId: string) =>
    request<Revision>(`/documents/${documentId}/draft`, { method: "POST" }),
  autosave: (documentId: string, content: string) =>
    request<Revision>(`/documents/${documentId}/draft`, { method: "PATCH", body: { content } }),
  submit: (documentId: string) =>
    request<Revision>(`/documents/${documentId}/draft/submit`, { method: "POST" }),
};

export const revisions = {
  get: (revisionId: string) => request<Revision>(`/revisions/${revisionId}`),
  diff: (revisionId: string) => request<DiffResponse>(`/revisions/${revisionId}/diff`),
  approve: (revisionId: string) =>
    request<Revision>(`/revisions/${revisionId}/approve`, { method: "POST" }),
  reject: (revisionId: string) =>
    request<Revision>(`/revisions/${revisionId}/reject`, { method: "POST" }),
  requestChanges: (revisionId: string) =>
    request<Revision>(`/revisions/${revisionId}/request-changes`, { method: "POST" }),
  listComments: (revisionId: string) => request<Comment[]>(`/revisions/${revisionId}/comments`),
  createComment: (revisionId: string, diffOpIndex: number, body: string) =>
    request<Comment>(`/revisions/${revisionId}/comments`, {
      method: "POST",
      body: { diff_op_index: diffOpIndex, body },
    }),
  resolveComment: (commentId: string) =>
    request<Comment>(`/comments/${commentId}/resolve`, { method: "PATCH" }),
  deleteComment: (commentId: string) =>
    request<void>(`/comments/${commentId}`, { method: "DELETE" }),
};

// --- Import ------------------------------------------------------------------

export const importApi = {
  docx: (projectId: string, file: File, title: string, documentId?: string) => {
    const form = new FormData();
    form.set("file", file);
    form.set("title", title);
    if (documentId) form.set("document_id", documentId);
    return request<ImportResult>(`/projects/${projectId}/import/docx`, {
      method: "POST",
      body: form,
    });
  },
};

// --- Export --------------------------------------------------------------
// These need the Authorization header, so a plain <a href> won't work —
// fetch as a blob and trigger the browser's download via an object URL.

async function downloadBlob(path: string, filename: string) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as ApiErrorBody;
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const exportApi = {
  docx: (revisionId: string) => downloadBlob(`/revisions/${revisionId}/export/docx`, "export.docx"),
  pdf: (revisionId: string) => downloadBlob(`/revisions/${revisionId}/export/pdf`, "export.pdf"),
};
