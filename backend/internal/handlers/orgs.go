package handlers

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/httpx"
	"github.com/kenoma/backend/internal/services/orgs"
	"github.com/kenoma/backend/internal/services/permissions"
)

type organizationResponse struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	IsPersonal       bool    `json:"is_personal"`
	Role             string  `json:"role,omitempty"`
	MembersCanInvite bool    `json:"members_can_invite"`
	CreatedAt        string  `json:"created_at"`
	DeletedAt        *string `json:"deleted_at,omitempty"`
}

func toOrganizationResponse(o db.Organization, role string) organizationResponse {
	resp := organizationResponse{
		ID:               o.ID.String(),
		Name:             o.Name,
		IsPersonal:       o.IsPersonal,
		Role:             role,
		MembersCanInvite: o.MembersCanInvite,
		CreatedAt:        o.CreatedAt.Format(time.RFC3339),
	}
	// Only the deleted listing carries a timestamp; live orgs omit the field
	// entirely rather than sending a null.
	if o.DeletedAt.Valid {
		value := o.DeletedAt.Time.Format(time.RFC3339)
		resp.DeletedAt = &value
	}
	return resp
}

func (s *Server) handleListOrgs(w http.ResponseWriter, r *http.Request) {
	userID, ok := callerID(w, r)
	if !ok {
		return
	}

	rows, err := s.orgSvc.ListForUser(r.Context(), userID)
	if err != nil {
		writeTenantError(w, err)
		return
	}

	out := make([]organizationResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toOrganizationRowResponse(row))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// toOrganizationRowResponse shapes a membership row (org fields plus the
// caller's role) into the wire response. Both the live and deleted lists use
// the same row type, so this keeps the deleted_at field handling in one place.
func toOrganizationRowResponse(row db.ListOrganizationsForUserRow) organizationResponse {
	resp := organizationResponse{
		ID:               row.ID.String(),
		Name:             row.Name,
		IsPersonal:       row.IsPersonal,
		Role:             row.Role,
		MembersCanInvite: row.MembersCanInvite,
		CreatedAt:        row.CreatedAt.Format(time.RFC3339),
	}
	if row.DeletedAt.Valid {
		value := row.DeletedAt.Time.Format(time.RFC3339)
		resp.DeletedAt = &value
	}
	return resp
}

// handleListDeletedOrgs lists the organizations the caller administers that
// have been taken out, so an admin who removed an org can find and restore it
// from the workspace dashboard. The deleted orgs drop out of the ordinary
// list, so this is the only way back in.
func (s *Server) handleListDeletedOrgs(w http.ResponseWriter, r *http.Request) {
	userID, ok := callerID(w, r)
	if !ok {
		return
	}

	rows, err := s.orgSvc.ListDeletedForUser(r.Context(), userID)
	if err != nil {
		writeTenantError(w, err)
		return
	}

	out := make([]organizationResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toOrganizationRowResponse(row))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type createOrgRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleCreateOrg(w http.ResponseWriter, r *http.Request) {
	userID, ok := callerID(w, r)
	if !ok {
		return
	}
	var req createOrgRequest
	if !decodeBody(w, r, &req) {
		return
	}

	org, err := s.orgSvc.Create(r.Context(), userID, req.Name)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toOrganizationResponse(org, permissions.RoleAdmin))
}

func (s *Server) handleGetOrg(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	org, role, err := s.orgSvc.Get(r.Context(), userID, orgID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toOrganizationResponse(org, role))
}

// Both fields are optional pointers: an absent field is left alone, so the
// same endpoint serves a rename and a settings toggle without either one
// clobbering the other.
type updateOrgRequest struct {
	Name             *string `json:"name"`
	MembersCanInvite *bool   `json:"members_can_invite"`
}

func (s *Server) handleUpdateOrg(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	var req updateOrgRequest
	if !decodeBody(w, r, &req) {
		return
	}
	org, err := s.orgSvc.Update(r.Context(), userID, orgID, orgs.UpdateParams{
		Name:             req.Name,
		MembersCanInvite: req.MembersCanInvite,
	})
	if err != nil {
		writeTenantError(w, err)
		return
	}
	// Only an admin reaches this point, so the role is not in question.
	httpx.WriteJSON(w, http.StatusOK, toOrganizationResponse(org, permissions.RoleAdmin))
}

func (s *Server) handleDeleteOrg(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	if err := s.orgSvc.SoftDelete(r.Context(), userID, orgID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

func (s *Server) handleRestoreOrg(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	if err := s.orgSvc.Restore(r.Context(), userID, orgID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

// --- Members ---------------------------------------------------------------

type memberResponse struct {
	ID       string `json:"id"`
	UserID   string `json:"user_id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	JoinedAt string `json:"joined_at"`
}

func (s *Server) handleListMembers(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	rows, err := s.orgSvc.ListMembers(r.Context(), userID, orgID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]memberResponse, 0, len(rows))
	for _, m := range rows {
		out = append(out, memberResponse{
			ID:       m.ID.String(),
			UserID:   m.UserID.String(),
			Email:    m.Email,
			Name:     m.Name,
			Role:     m.Role,
			JoinedAt: m.JoinedAt.Format(time.RFC3339),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type updateMemberRoleRequest struct {
	Role string `json:"role"`
}

func (s *Server) handleUpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	memberID, ok := pathID(w, r, "memberId")
	if !ok {
		return
	}
	var req updateMemberRoleRequest
	if !decodeBody(w, r, &req) {
		return
	}
	member, err := s.orgSvc.UpdateMemberRole(r.Context(), userID, orgID, memberID, req.Role)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"id":   member.ID.String(),
		"role": member.Role,
	})
}

func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	memberID, ok := pathID(w, r, "memberId")
	if !ok {
		return
	}
	if err := s.orgSvc.RemoveMember(r.Context(), userID, orgID, memberID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

// --- Invitations -----------------------------------------------------------

type invitationResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	ExpiresAt string `json:"expires_at"`
	CreatedAt string `json:"created_at"`
	CanRevoke bool   `json:"can_revoke"`
	// Only the create response carries the accept link: the raw token is
	// never stored, only hashed, so there is nothing to reconstruct it from
	// on the list endpoint.
	AcceptLink string `json:"accept_link,omitempty"`
}

// canRevokeInvitation mirrors the service rule: admins revoke anything, a
// member revokes what they sent. The client gets the verdict rather than
// invited_by, so it never has to reimplement the rule.
func canRevokeInvitation(i db.OrganizationInvitation, callerID uuid.UUID, callerRole string) bool {
	return callerRole == permissions.RoleAdmin || i.InvitedBy == callerID
}

func toInvitationResponse(i db.OrganizationInvitation, canRevoke bool) invitationResponse {
	return invitationResponse{
		ID:        i.ID.String(),
		Email:     i.Email,
		Role:      i.Role,
		ExpiresAt: i.ExpiresAt.Format(time.RFC3339),
		CreatedAt: i.CreatedAt.Format(time.RFC3339),
		CanRevoke: canRevoke,
	}
}

type inviteRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func (s *Server) handleInvite(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	var req inviteRequest
	if !decodeBody(w, r, &req) {
		return
	}
	inv, link, err := s.orgSvc.Invite(r.Context(), userID, orgID, req.Email, req.Role)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	// The sender can always take back what they just sent. The accept link
	// rides on the create response only: the raw token is hashed in the DB,
	// so the list endpoint cannot reconstruct it for existing invitations.
	resp := toInvitationResponse(inv, true)
	resp.AcceptLink = link
	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (s *Server) handleListInvitations(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	rows, role, err := s.orgSvc.ListInvitations(r.Context(), userID, orgID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]invitationResponse, 0, len(rows))
	for _, inv := range rows {
		out = append(out, toInvitationResponse(inv, canRevokeInvitation(inv, userID, role)))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	userID, orgID, ok := callerAndPathID(w, r, "orgId")
	if !ok {
		return
	}
	inviteID, ok := pathID(w, r, "invitationId")
	if !ok {
		return
	}
	if err := s.orgSvc.RevokeInvitation(r.Context(), userID, orgID, inviteID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

type acceptInvitationRequest struct {
	Token string `json:"token"`
}

func (s *Server) handleAcceptInvitation(w http.ResponseWriter, r *http.Request) {
	userID, ok := callerID(w, r)
	if !ok {
		return
	}
	var req acceptInvitationRequest
	if !decodeBody(w, r, &req) {
		return
	}
	org, role, err := s.orgSvc.AcceptInvitation(r.Context(), userID, req.Token)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toOrganizationResponse(org, role))
}

// callerID pulls the authenticated user out of the request context, where
// RequireAuth put it. A miss means the route was registered without the
// middleware, which is a wiring bug rather than a client error.
func callerID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := middlewareUserID(r)
	id, err := uuid.Parse(raw)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "authentication required")
		return uuid.Nil, false
	}
	return id, true
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue(name))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid "+name)
		return uuid.Nil, false
	}
	return id, true
}

func callerAndPathID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, uuid.UUID, bool) {
	userID, ok := callerID(w, r)
	if !ok {
		return uuid.Nil, uuid.Nil, false
	}
	pathVal, ok := pathID(w, r, name)
	if !ok {
		return uuid.Nil, uuid.Nil, false
	}
	return userID, pathVal, true
}
