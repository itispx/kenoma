// Mirrors the JSON shapes returned by the Go backend (internal/handlers/*.go).
// Kept as one file since the DTOs are small and this is the only consumer.
//
// Revisions and comments are the types still to come; everything the backend
// serves today has a shape here.

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

export type OrgRole = "admin" | "member";
export type PermissionKey =
  | "docs:import"
  | "docs:edit"
  | "docs:submit_review"
  | "docs:review"
  | "docs:approve"
  | "docs:export"
  | "docs:manage_comments"
  | "docs:manage";

export interface Organization {
  id: string;
  name: string;
  is_personal: boolean;
  role?: OrgRole;
  members_can_invite: boolean;
  created_at: string;
  // Only present on the deleted-orgs list, which is how a restore surface
  // shows what was taken out without guessing from created_at.
  deleted_at?: string;
}
export interface OrgMember {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: OrgRole;
  joined_at: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  created_at: string;
  can_revoke: boolean;
  // Only the create response carries this: the raw token is hashed in the
  // DB, so an invitation already on the list cannot have its link rebuilt.
  accept_link?: string;
}
export interface Project {
  id: string;
  organization_id: string;
  name: string;
  created_by: string;
  created_at: string;
  deleted_at?: string;
}
export interface Permission {
  key: PermissionKey;
  description: string;
}
export interface PermissionGrant {
  id: string;
  project_id: string;
  user_id: string;
  email: string;
  user_name: string;
  permission_key: PermissionKey;
  created_at: string;
}

// Named Doc rather than Document so it cannot be confused with the DOM's
// global Document in a file that also touches the editor.
export interface Doc {
  id: string;
  project_id: string;
  title: string;
  content_markdown: string;
  // Null while the document is an initial draft with no published version.
  head_revision_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// The list endpoint leaves the body out on purpose: a project's document list
// would otherwise carry every document's full text. deleted_at is only present
// on the deleted-documents list, which is how a restore surface shows what was
// taken out without guessing from updated_at.
export type DocSummary = Omit<Doc, "content_markdown"> & { deleted_at?: string };

// --- Versioning: revisions, branches, Change Requests ----------------------

export type ChangeRequestStatus = "open" | "merged" | "closed";

// One immutable snapshot of main. Bodies are only served one-at-a-time.
export interface RevisionSummary {
  id: string;
  document_id: string;
  seq: number;
  title: string;
  created_by: string;
  created_at: string;
}

export interface Revision extends RevisionSummary {
  content_markdown: string;
}

// Inline redline piece. ins exists only in the target text, del only in the
// base, plain in both; concatenated in order they reconstruct both sides.
export interface DiffSpan {
  op: "plain" | "ins" | "del";
  text: string;
}

export interface CRComment {
  id: string;
  parent_id: string | null;
  created_by: string;
  body: string;
  // {"op_index": number, "context_hash": string}, or {} for general comments.
  diff_anchor: {
    op_index?: number;
    op_end_index?: number;
    context_hash?: string;
  };
  created_at: string;
}

export interface ChangeRequest {
  id: string;
  document_id: string;
  // Denormalized onto every response so pages can ask for project-scoped
  // permissions without another round trip.
  project_id: string;
  base_revision_id: string;
  kind: "edit" | "import";
  title: string;
  status: "open" | "merged" | "closed";
  opened_by: string;
  merged_by: string | null;
  close_note: string;
  // False means main moved past this CR's base: merging needs a resolution.
  head_matches_base: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  workstream_id: string | null;
}

// List responses leave the snapshot body out; the detail shape adds it.
export type ChangeRequestSummary = Omit<ChangeRequest, "content_markdown">;

// The project-scoped review queue: the summary shape plus the document's
// title, so a project page can list open proposals without a second fetch.
export interface ChangeRequestProjectSummary {
  id: string;
  document_id: string;
  project_id: string;
  document_title: string;
  kind: "edit" | "import";
  title: string;
  status: "open" | "merged" | "closed";
  opened_by: string;
  created_at: string;
  updated_at: string;
  workstream_id: string | null;
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
  content_markdown: string;
}

export interface ChangeLog {
  id: string;
  workstream_id: string;
  seq: number;
  parent_change_log_id: string | null;
  message: string;
  title: string;
  content_markdown?: string;
  created_by: string;
  created_at: string;
}

// A branch: one named line of work on a document. Visible to everyone who can
// see the project, writable only by its owner. The uncommitted working copy
// lives in the owner's browser and never appears here.
export interface Workstream {
  id: string;
  document_id: string;
  owner_id: string;
  name: string;
  base_revision_id: string;
  status: "active" | "submitted" | "abandoned";
  change_logs: ChangeLog[];
  created_at: string;
  updated_at: string;
}

// One row of the branch list: no log bodies, so switching branches does not
// pull every checkpoint in every branch.
export interface WorkstreamSummary {
  id: string;
  document_id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  base_revision_id: string;
  status: "active" | "submitted" | "abandoned";
  change_log_count: number;
  created_at: string;
  updated_at: string;
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
