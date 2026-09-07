package handlers

import (
	"net/http"

	"github.com/kenoma/backend/internal/middleware"
)

func (s *Server) Router() http.Handler {
	return middleware.Logging(
		middleware.Recovery(
			middleware.CORS(s.cfg.FrontendURL, s.mux),
		),
	)
}

// middlewareUserID reads the authenticated user id that RequireAuth stored on
// the request context.
func middlewareUserID(r *http.Request) string {
	return middleware.UserID(r.Context())
}

// authed wraps a handler in RequireAuth. Every tenant route goes through it,
// so a route registered without it is visibly missing the wrapper rather than
// silently unprotected.
func (s *Server) authed(h http.HandlerFunc) http.HandlerFunc {
	return middleware.RequireAuth(s.cfg, h).ServeHTTP
}

// authLimited wraps a handler in the auth rate limiter. It is the public
// surface an attacker can hammer without a session, so login/register/reset
// go through it (and through it only — they have no RequireAuth to add).
// AUTH_RATE_LIMIT=0 disables the limiter, which is how tests and single-user
// dev machines stay unbothered.
func (s *Server) authLimited(h http.HandlerFunc) http.HandlerFunc {
	if s.authLimiter == nil {
		return h
	}
	return middleware.RateLimit(s.authLimiter, s.cfg.TrustProxy, h).ServeHTTP
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)

	// --- Public auth ---
	s.mux.HandleFunc("POST /api/v1/auth/register", s.authLimited(s.handleRegister))
	s.mux.HandleFunc("POST /api/v1/auth/login", s.authLimited(s.handleLogin))
	s.mux.HandleFunc("POST /api/v1/auth/refresh", s.authLimited(s.handleRefresh))
	s.mux.HandleFunc("POST /api/v1/auth/logout", s.authLimited(s.handleLogout))
	s.mux.HandleFunc("POST /api/v1/auth/password-reset/request", s.authLimited(s.handleRequestPasswordReset))
	s.mux.HandleFunc("POST /api/v1/auth/password-reset/confirm", s.authLimited(s.handleConfirmPasswordReset))

	// --- Organizations ---
	s.mux.HandleFunc("GET /api/v1/orgs", s.authed(s.handleListOrgs))
	s.mux.HandleFunc("POST /api/v1/orgs", s.authed(s.handleCreateOrg))
	// Deleted orgs, for admins restoring one that was taken out. The literal
	// segment beats the {orgId} wildcard on the next line, so this stays
	// unambiguous. A separate path keeps the ordinary list cheap.
	s.mux.HandleFunc("GET /api/v1/orgs/deleted", s.authed(s.handleListDeletedOrgs))
	s.mux.HandleFunc("GET /api/v1/orgs/{orgId}", s.authed(s.handleGetOrg))
	s.mux.HandleFunc("PATCH /api/v1/orgs/{orgId}", s.authed(s.handleUpdateOrg))
	s.mux.HandleFunc("DELETE /api/v1/orgs/{orgId}", s.authed(s.handleDeleteOrg))
	s.mux.HandleFunc("POST /api/v1/orgs/{orgId}/restore", s.authed(s.handleRestoreOrg))

	// --- Members ---
	s.mux.HandleFunc("GET /api/v1/orgs/{orgId}/members", s.authed(s.handleListMembers))
	s.mux.HandleFunc("PATCH /api/v1/orgs/{orgId}/members/{memberId}", s.authed(s.handleUpdateMemberRole))
	s.mux.HandleFunc("DELETE /api/v1/orgs/{orgId}/members/{memberId}", s.authed(s.handleRemoveMember))

	// --- Invitations ---
	s.mux.HandleFunc("GET /api/v1/orgs/{orgId}/invitations", s.authed(s.handleListInvitations))
	s.mux.HandleFunc("POST /api/v1/orgs/{orgId}/invitations", s.authed(s.handleInvite))
	s.mux.HandleFunc("DELETE /api/v1/orgs/{orgId}/invitations/{invitationId}", s.authed(s.handleRevokeInvitation))
	s.mux.HandleFunc("POST /api/v1/invitations/accept", s.authed(s.handleAcceptInvitation))

	// --- Projects ---
	s.mux.HandleFunc("GET /api/v1/orgs/{orgId}/projects", s.authed(s.handleListProjects))
	s.mux.HandleFunc("POST /api/v1/orgs/{orgId}/projects", s.authed(s.handleCreateProject))
	// Deleted projects, for org admins restoring one that was taken out. A
	// separate path keeps the ordinary list cheap and unambiguous.
	s.mux.HandleFunc("GET /api/v1/orgs/{orgId}/projects/deleted", s.authed(s.handleListDeletedProjects))
	s.mux.HandleFunc("GET /api/v1/projects/{projectId}", s.authed(s.handleGetProject))
	s.mux.HandleFunc("PATCH /api/v1/projects/{projectId}", s.authed(s.handleRenameProject))
	s.mux.HandleFunc("DELETE /api/v1/projects/{projectId}", s.authed(s.handleDeleteProject))
	s.mux.HandleFunc("POST /api/v1/projects/{projectId}/restore", s.authed(s.handleRestoreProject))
	s.mux.HandleFunc("GET /api/v1/projects/{projectId}/my-permissions", s.authed(s.handleMyProjectPermissions))

	// --- Documents ---
	s.mux.HandleFunc("GET /api/v1/projects/{projectId}/documents", s.authed(s.handleListDocuments))
	// Deleted documents, for managers restoring a row that was taken out. A
	// separate path keeps the ordinary list cheap and unambiguous.
	s.mux.HandleFunc("GET /api/v1/projects/{projectId}/documents/deleted", s.authed(s.handleListDeletedDocuments))
	s.mux.HandleFunc("POST /api/v1/projects/{projectId}/documents", s.authed(s.handleCreateDocument))
	// Import: a new document lands directly on main; a docx for an existing
	// document opens an import Change Request instead.
	s.mux.HandleFunc("POST /api/v1/projects/{projectId}/documents/import", s.authed(s.handleImportDocument))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}", s.authed(s.handleGetDocument))
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/initial-version", s.authed(s.handleSaveInitialVersion))
	s.mux.HandleFunc("DELETE /api/v1/documents/{documentId}", s.authed(s.handleDeleteDocument))
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/restore", s.authed(s.handleRestoreDocument))
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/import", s.authed(s.handleImportRevision))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/workstreams", s.authed(s.handleListWorkstreams))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/workstreams/{workstreamId}", s.authed(s.handleGetWorkstream))
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/workstreams", s.authed(s.handleCreateWorkstream))
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/workstreams/{workstreamId}/change-logs", s.authed(s.handleAppendChangeLog))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/workstreams/{workstreamId}/diff", s.authed(s.handleWorkstreamDiff))
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/workstreams/{workstreamId}/reconcile-diff", s.authed(s.handleWorkstreamReconcileDiff))
	s.mux.HandleFunc("DELETE /api/v1/documents/{documentId}/workstreams/{workstreamId}", s.authed(s.handleAbandonWorkstream))

	// --- Revisions (main's immutable history) ---
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/revisions", s.authed(s.handleListRevisions))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/revisions/{revisionId}", s.authed(s.handleGetRevision))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/diff", s.authed(s.handleDiffRevisions))
	// Export one approved snapshot as a file. Gated on docs:export; format is
	// chosen per request (?format=docx|pdf) so the route stays a single line.
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/revisions/{revisionId}/export", s.authed(s.handleExportRevision))

	// --- Change Requests ---
	s.mux.HandleFunc("POST /api/v1/documents/{documentId}/change-requests", s.authed(s.handleOpenChangeRequest))
	s.mux.HandleFunc("GET /api/v1/documents/{documentId}/change-requests", s.authed(s.handleListChangeRequestsForDocument))
	s.mux.HandleFunc("GET /api/v1/change-requests/{changeRequestId}", s.authed(s.handleGetChangeRequest))
	s.mux.HandleFunc("POST /api/v1/change-requests/{changeRequestId}/merge", s.authed(s.handleMergeChangeRequest))
	s.mux.HandleFunc("POST /api/v1/change-requests/{changeRequestId}/close", s.authed(s.handleCloseChangeRequest))
	s.mux.HandleFunc("GET /api/v1/change-requests/{changeRequestId}/diff", s.authed(s.handleDiffChangeRequest))
	s.mux.HandleFunc("GET /api/v1/change-requests/{changeRequestId}/change-logs", s.authed(s.handleListChangeLogsForChangeRequest))
	s.mux.HandleFunc("GET /api/v1/change-requests/{changeRequestId}/change-logs/{changeLogId}/diff", s.authed(s.handleDiffChangeLogForChangeRequest))
	s.mux.HandleFunc("GET /api/v1/change-requests/{changeRequestId}/comments", s.authed(s.handleListCRComments))
	s.mux.HandleFunc("POST /api/v1/change-requests/{changeRequestId}/comments", s.authed(s.handleAddCRComment))
	s.mux.HandleFunc("DELETE /api/v1/change-requests/{changeRequestId}/comments/{commentId}", s.authed(s.handleDeleteCRComment))

	// --- Permission catalog and grants ---
	s.mux.HandleFunc("GET /api/v1/permissions", s.authed(s.handleListPermissions))
	s.mux.HandleFunc("GET /api/v1/projects/{projectId}/permissions", s.authed(s.handleListGrants))
	s.mux.HandleFunc("POST /api/v1/projects/{projectId}/permissions", s.authed(s.handleGrantPermission))
	s.mux.HandleFunc("DELETE /api/v1/projects/{projectId}/permissions", s.authed(s.handleRevokePermission))
}
