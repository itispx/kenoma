package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/httpx"
	"github.com/kenoma/backend/internal/pandoc"
	"github.com/kenoma/backend/internal/services/crs"
	"github.com/kenoma/backend/internal/services/documents"
	"github.com/kenoma/backend/internal/services/orgs"
	"github.com/kenoma/backend/internal/services/permissions"
	"github.com/kenoma/backend/internal/services/projects"
	"github.com/kenoma/backend/internal/services/workstreams"
)

// writeTenantError maps the org, project, and document service sentinels to
// statuses.
//
// permissions.ErrDenied deliberately becomes 404 rather than 403: telling a
// caller "forbidden" confirms the id exists, which leaks the shape of another
// tenant's data. A caller who cannot see something is told it is not there.
func writeTenantError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, orgs.ErrValidation), errors.Is(err, projects.ErrValidation),
		errors.Is(err, documents.ErrValidation), errors.Is(err, crs.ErrValidation),
		errors.Is(err, workstreams.ErrValidation):
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, projects.ErrUnknownKey):
		httpx.WriteError(w, http.StatusBadRequest, "unknown permission key")
	case errors.Is(err, permissions.ErrDenied):
		httpx.WriteError(w, http.StatusNotFound, "not found")
	case errors.Is(err, orgs.ErrNotFound), errors.Is(err, projects.ErrNotFound),
		errors.Is(err, documents.ErrNotFound), errors.Is(err, crs.ErrNotFound),
		errors.Is(err, workstreams.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not found")
	// A merge that would clobber newer main is the one conflict the client can
	// act on, so it says what happened rather than hiding behind a generic 409.
	case errors.Is(err, crs.ErrConflict):
		httpx.WriteError(w, http.StatusConflict,
			"main has moved since this change request was opened; a conflict resolution is required")
	case errors.Is(err, crs.ErrNotOpen):
		httpx.WriteError(w, http.StatusConflict, "this change request is no longer open")
	case errors.Is(err, workstreams.ErrNameTaken):
		httpx.WriteError(w, http.StatusConflict, "a branch with that name already exists on this document")
	// Reading someone else's branch is fine; writing to it is not. A 403 says
	// which of the two the caller hit, where a 404 would suggest the branch is
	// gone when the caller can plainly see it in the list.
	case errors.Is(err, workstreams.ErrNotOwner):
		httpx.WriteError(w, http.StatusForbidden, "only the branch owner can change it")
	case errors.Is(err, crs.ErrWorkstreamChanged), errors.Is(err, workstreams.ErrConflict):
		httpx.WriteError(w, http.StatusConflict, "the workstream changed; refresh its Change Logs and reconcile your draft")
	case errors.Is(err, documents.ErrInitialVersionExists):
		httpx.WriteError(w, http.StatusConflict, "the first version has already been saved")
	case errors.Is(err, documents.ErrTooLarge), errors.Is(err, crs.ErrTooLarge), errors.Is(err, workstreams.ErrTooLarge):
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "the content is too large to save")
	case errors.Is(err, pandoc.ErrConversion):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "could not convert this docx file")
	case errors.Is(err, pandoc.ErrUnavailable):
		httpx.WriteError(w, http.StatusServiceUnavailable, "document conversion is unavailable right now")
	case errors.Is(err, orgs.ErrLastAdmin):
		httpx.WriteError(w, http.StatusConflict, "the organization must keep at least one admin")
	case errors.Is(err, orgs.ErrPersonalOrg):
		httpx.WriteError(w, http.StatusConflict, "personal spaces cannot be renamed, deleted, or shared this way")
	case errors.Is(err, orgs.ErrAlreadyMember):
		httpx.WriteError(w, http.StatusConflict, "that person is already a member")
	case errors.Is(err, orgs.ErrInviteDuplicate):
		httpx.WriteError(w, http.StatusConflict, "an invitation for that address is already pending")
	// The only deny that says why: the caller is a member of this org and
	// knows it exists, so masking it as a 404 would explain nothing.
	case errors.Is(err, orgs.ErrInviteRoleNotAllowed):
		httpx.WriteError(w, http.StatusForbidden, "members can only invite members")
	case errors.Is(err, orgs.ErrInviteNotValid):
		httpx.WriteError(w, http.StatusBadRequest, "invalid or expired invitation")
	default:
		httpx.WriteError(w, http.StatusInternalServerError, "internal server error")
	}
}

type projectResponse struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organization_id"`
	Name           string  `json:"name"`
	CreatedBy      string  `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	DeletedAt      *string `json:"deleted_at,omitempty"`
}

func toProjectResponse(p db.Project) projectResponse {
	resp := projectResponse{
		ID:             p.ID.String(),
		OrganizationID: p.OrganizationID.String(),
		Name:           p.Name,
		CreatedBy:      p.CreatedBy.String(),
		CreatedAt:      p.CreatedAt.Format(time.RFC3339),
	}
	// Only the deleted listing carries a timestamp; live projects omit the
	// field entirely rather than sending a null.
	if p.DeletedAt.Valid {
		value := p.DeletedAt.Time.Format(time.RFC3339)
		resp.DeletedAt = &value
	}
	return resp
}

type createProjectRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	var req createProjectRequest
	if !decodeBody(w, r, &req) {
		return
	}
	project, err := s.projectSvc.Create(r.Context(), userID, orgID, req.Name)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toProjectResponse(project))
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	rows, err := s.projectSvc.ListForOrg(r.Context(), userID, orgID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]projectResponse, 0, len(rows))
	for _, p := range rows {
		out = append(out, toProjectResponse(p))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	project, err := s.projectSvc.Get(r.Context(), userID, projectID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

type renameRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleRenameProject(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	var req renameRequest
	if !decodeBody(w, r, &req) {
		return
	}
	project, err := s.projectSvc.Rename(r.Context(), userID, projectID, req.Name)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	if err := s.projectSvc.SoftDelete(r.Context(), userID, projectID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

func (s *Server) handleRestoreProject(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	if err := s.projectSvc.Restore(r.Context(), userID, projectID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

func (s *Server) handleListDeletedProjects(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	rows, err := s.projectSvc.ListDeletedForOrg(r.Context(), userID, orgID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]projectResponse, 0, len(rows))
	for _, p := range rows {
		out = append(out, toProjectResponse(p))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleMyProjectPermissions(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	keys, err := s.projectSvc.MyPermissions(r.Context(), userID, projectID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, keys)
}

// --- Permission catalog and grants -----------------------------------------

type permissionResponse struct {
	Key         string `json:"key"`
	Description string `json:"description"`
}

func (s *Server) handleListPermissions(w http.ResponseWriter, r *http.Request) {
	if _, ok := callerID(w, r); !ok {
		return
	}
	rows, err := s.projectSvc.ListPermissionCatalog(r.Context())
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]permissionResponse, 0, len(rows))
	for _, p := range rows {
		out = append(out, permissionResponse{Key: p.Key, Description: p.Description})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type grantResponse struct {
	ID            string `json:"id"`
	ProjectID     string `json:"project_id"`
	UserID        string `json:"user_id"`
	Email         string `json:"email"`
	UserName      string `json:"user_name"`
	PermissionKey string `json:"permission_key"`
	CreatedAt     string `json:"created_at"`
}

func (s *Server) handleListGrants(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	rows, err := s.projectSvc.ListGrants(r.Context(), userID, projectID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]grantResponse, 0, len(rows))
	for _, g := range rows {
		out = append(out, grantResponse{
			ID:            g.ID.String(),
			ProjectID:     g.ProjectID.String(),
			UserID:        g.UserID.String(),
			Email:         g.Email,
			UserName:      g.UserName,
			PermissionKey: g.PermissionKey,
			CreatedAt:     g.CreatedAt.Format(time.RFC3339),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type grantRequest struct {
	UserID        string `json:"user_id"`
	PermissionKey string `json:"permission_key"`
}

func (s *Server) handleGrantPermission(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	var req grantRequest
	if !decodeBody(w, r, &req) {
		return
	}
	targetID, err := uuid.Parse(req.UserID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid user_id")
		return
	}
	if err := s.projectSvc.Grant(r.Context(), userID, projectID, targetID, req.PermissionKey); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

func (s *Server) handleRevokePermission(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	targetID, err := uuid.Parse(r.URL.Query().Get("user_id"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid user_id")
		return
	}
	key := r.URL.Query().Get("permission_key")
	if key == "" {
		httpx.WriteError(w, http.StatusBadRequest, "permission_key is required")
		return
	}
	if err := s.projectSvc.Revoke(r.Context(), userID, projectID, targetID, key); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}
