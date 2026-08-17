// Thin fetch wrapper around the Go backend. Handles auth header injection and
// one silent-refresh-and-retry on a 401 so a merely-expired access token
// doesn't bounce the user to /login mid-session.
"use client";

import type { ApiEnvelope, AuthResponse } from "./types";

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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
