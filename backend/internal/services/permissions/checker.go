package permissions

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	db "github.com/kenoma/backend/db/sqlc"
)

const (
	KeyImport         = "docs:import"
	KeyEdit           = "docs:edit"
	KeySubmitReview   = "docs:submit_review"
	KeyReview         = "docs:review"
	KeyApprove        = "docs:approve"
	KeyExport         = "docs:export"
	KeyManageComments = "docs:manage_comments"
	KeyManage         = "docs:manage"
)

// Organization-level roles, as stored in organization_member.role.
const (
	RoleAdmin  = "admin"
	RoleMember = "member"
)

var ErrDenied = errors.New("permission denied")

type Checker struct {
	Queries db.Querier
}

func New(queries db.Querier) *Checker {
	return &Checker{Queries: queries}
}

func (c *Checker) HasPermission(ctx context.Context, userID, projectID uuid.UUID, key string) (bool, error) {
	allowed, err := c.Queries.UserHasProjectPermission(ctx, db.UserHasProjectPermissionParams{
		ID:            projectID,
		UserID:        userID,
		PermissionKey: key,
	})
	if err != nil {
		return false, fmt.Errorf("check permission %s: %w", key, err)
	}
	return allowed, nil
}

// RoleInOrg returns the caller's role in the organization, or "" when they are
// not a member at all. Callers that need to distinguish admin from member want
// this rather than two boolean lookups.
func (c *Checker) RoleInOrg(ctx context.Context, userID, orgID uuid.UUID) (string, error) {
	member, err := c.Queries.GetOrganizationMember(ctx, db.GetOrganizationMemberParams{
		OrganizationID: orgID,
		UserID:         userID,
	})
	if err != nil {
		if isNoRows(err) {
			return "", nil
		}
		return "", fmt.Errorf("look up membership: %w", err)
	}
	return member.Role, nil
}

func (c *Checker) IsOrgAdmin(ctx context.Context, userID, orgID uuid.UUID) (bool, error) {
	role, err := c.RoleInOrg(ctx, userID, orgID)
	return role == RoleAdmin, err
}

func (c *Checker) IsOrgMember(ctx context.Context, userID, orgID uuid.UUID) (bool, error) {
	role, err := c.RoleInOrg(ctx, userID, orgID)
	return role != "", err
}

// CanSeeProject answers "holds any permission at all", which is the read gate
// wherever no single key is the obvious one: listing a project, opening a
// document. It lives here rather than on a service because every other
// authorization question does, and read visibility is the one most likely to be
// re-derived subtly differently somewhere else.
func (c *Checker) CanSeeProject(ctx context.Context, userID, projectID uuid.UUID) (bool, error) {
	keys, err := c.Queries.ListUserPermissionKeysForProject(ctx, db.ListUserPermissionKeysForProjectParams{
		ProjectID: projectID,
		UserID:    userID,
	})
	if err != nil {
		return false, fmt.Errorf("list grants: %w", err)
	}
	if len(keys) > 0 {
		return true, nil
	}
	// No grants, so the only remaining route in is org admin. Any key works as
	// the probe since admins pass on all of them.
	return c.HasPermission(ctx, userID, projectID, KeyManage)
}
