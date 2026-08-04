// Mirrors the JSON shapes returned by the Go backend (internal/handlers/*.go).
// Kept as one file since the DTOs are small and this is the only consumer.

export type PermissionKey =
  | "docs:import"
  | "docs:edit"
  | "docs:submit_review"
  | "docs:review"
  | "docs:approve"
  | "docs:export"
  | "docs:manage_comments"
  | "docs:manage";

export interface Permission {
  key: PermissionKey;
  description: string;
}

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

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export type OrgRole = "admin" | "member";

export interface OrgMember {
  id: string; // organization_member id (distinct from user id — used for permission grants)
  user_id: string;
  email: string;
  name: string;
  role: OrgRole;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
}

export interface Project {
  id: string;
  organization_id: string | null;
  owner_id: string | null;
  name: string;
  created_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  current_published_revision_id: string | null;
}

export type RevisionStatus = "draft" | "in_review" | "approved" | "rejected";

export interface Revision {
  id: string;
  document_id: string;
  content: string;
  status: RevisionStatus;
  author_id: string;
  parent_revision_id: string | null;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export type DiffOpType = "equal" | "insert" | "delete";

export interface DiffOp {
  type: DiffOpType;
  text: string;
}

export interface DiffAnchor {
  diff_op_index: number;
  context_hash: string;
}

export interface DiffResponse {
  parent_revision_id: string | null;
  diff: { ops: DiffOp[] };
}

export interface Comment {
  id: string;
  revision_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  anchor: DiffAnchor;
  resolved: boolean;
  created_at: string;
}

export interface ProjectPermissionGrant {
  id: string;
  project_id: string;
  organization_member_id: string;
  permission_key: PermissionKey;
  granted_by: string;
  created_at: string;
  email: string;
  user_name: string;
}

export interface ImportResult {
  document: Document;
  revision: Revision;
}

export interface ApiErrorBody {
  error: string;
}
