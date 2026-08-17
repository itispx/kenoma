// Mirrors the JSON shapes returned by the Go backend (internal/handlers/*.go).
// Kept as one file since the DTOs are small and this is the only consumer.
//
// Auth is all the backend implements today, so these are all the types there
// are. Projects, documents, revisions, comments, orgs, and permissions get
// their types back as each feature is built.

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  access_token: string;
  expires_at: string;
  user: User;
}

// Every backend response is wrapped in this envelope (see backend
// internal/httpx/httpx.go): a status block plus either `data` on success or
// `error` on failure. Callers never see the envelope — request() unwraps it.
export interface ApiEnvelope<T> {
  status: {
    ok: boolean;
    code: number;
  };
  data?: T;
  error?: {
    message: string;
  };
}
