// Package projects holds project and permission-grant logic. Every entry
// point authorizes through permissions.Checker rather than assembling its own
// membership query, so there is one place to audit.
package projects

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/services/permissions"
)

var (
	ErrValidation = errors.New("validation failed")
	ErrNotFound   = errors.New("not found")
	ErrUnknownKey = errors.New("unknown permission key")
)

type Service struct {
	Queries db.Querier
	Checker *permissions.Checker
}

func New(queries db.Querier, checker *permissions.Checker) *Service {
	return &Service{Queries: queries, Checker: checker}
}

// Create lets any member of the organization start a project, and grants the
// creator docs:manage on it. Without that grant the creator would immediately
// lose sight of what they just made, since created_by carries no rights.
func (s *Service) Create(ctx context.Context, userID, orgID uuid.UUID, rawName string) (db.Project, error) {
	name := strings.TrimSpace(rawName)
	if name == "" {
		return db.Project{}, fmt.Errorf("%w: name is required", ErrValidation)
	}
	isMember, err := s.Checker.IsOrgMember(ctx, userID, orgID)
	if err != nil {
		return db.Project{}, err
	}
	if !isMember {
		return db.Project{}, permissions.ErrDenied
	}

	project, err := s.Queries.CreateProject(ctx, db.CreateProjectParams{
		OrganizationID: orgID,
		Name:           name,
		CreatedBy:      userID,
	})
	if err != nil {
		return db.Project{}, err
	}

	if _, err := s.Queries.CreateProjectPermissionGrant(ctx, db.CreateProjectPermissionGrantParams{
		ProjectID:     project.ID,
		UserID:        userID,
		PermissionKey: permissions.KeyManage,
		GrantedBy:     userID,
	}); err != nil {
		return db.Project{}, fmt.Errorf("grant creator docs:manage: %w", err)
	}
	return project, nil
}

// ListForOrg returns every project for an org admin, and only granted ones
// for everyone else. Membership alone conveys no visibility.
func (s *Service) ListForOrg(ctx context.Context, userID, orgID uuid.UUID) ([]db.Project, error) {
	isMember, err := s.Checker.IsOrgMember(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, permissions.ErrDenied
	}
	return s.Queries.ListProjectsForUserInOrg(ctx, db.ListProjectsForUserInOrgParams{
		OrganizationID: orgID,
		UserID:         userID,
	})
}

// Get requires any grant or org admin. A caller who cannot see the project
// gets the same answer whether or not the id is real.
func (s *Service) Get(ctx context.Context, userID, projectID uuid.UUID) (db.Project, error) {
	visible, err := s.Checker.CanSeeProject(ctx, userID, projectID)
	if err != nil {
		return db.Project{}, err
	}
	if !visible {
		return db.Project{}, permissions.ErrDenied
	}
	project, err := s.Queries.GetProjectByID(ctx, projectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Project{}, ErrNotFound
		}
		return db.Project{}, err
	}
	return project, nil
}

func (s *Service) Rename(ctx context.Context, userID, projectID uuid.UUID, rawName string) (db.Project, error) {
	name := strings.TrimSpace(rawName)
	if name == "" {
		return db.Project{}, fmt.Errorf("%w: name is required", ErrValidation)
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyManage)
	if err != nil {
		return db.Project{}, err
	}
	if !allowed {
		return db.Project{}, permissions.ErrDenied
	}
	return s.Queries.UpdateProjectName(ctx, db.UpdateProjectNameParams{ID: projectID, Name: name})
}

func (s *Service) SoftDelete(ctx context.Context, userID, projectID uuid.UUID) error {
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyManage)
	if err != nil {
		return err
	}
	if !allowed {
		return permissions.ErrDenied
	}
	return s.Queries.SoftDeleteProject(ctx, projectID)
}

// Restore cannot authorize through the checker, which denies everything on a
// soft-deleted project by design. Org admin is the way back in.
func (s *Service) Restore(ctx context.Context, userID, projectID uuid.UUID) error {
	project, err := s.Queries.GetProjectByIDIncludingDeleted(ctx, projectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	isAdmin, err := s.Checker.IsOrgAdmin(ctx, userID, project.OrganizationID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return permissions.ErrDenied
	}
	return s.Queries.RestoreProject(ctx, projectID)
}

// MyPermissions reports what the caller can do, so the UI can hide controls
// it would only be denied on. It is never the enforcement point.
func (s *Service) MyPermissions(ctx context.Context, userID, projectID uuid.UUID) ([]string, error) {
	project, err := s.Queries.GetProjectByID(ctx, projectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	// An org admin implicitly holds every key, so report the full set rather
	// than the empty grant list they would otherwise have.
	isAdmin, err := s.Checker.IsOrgAdmin(ctx, userID, project.OrganizationID)
	if err != nil {
		return nil, err
	}
	if isAdmin {
		all, err := s.Queries.ListPermissions(ctx)
		if err != nil {
			return nil, err
		}
		keys := make([]string, 0, len(all))
		for _, p := range all {
			keys = append(keys, p.Key)
		}
		return keys, nil
	}

	return s.Queries.ListUserPermissionKeysForProject(ctx, db.ListUserPermissionKeysForProjectParams{
		ProjectID: projectID,
		UserID:    userID,
	})
}

// --- Grants ----------------------------------------------------------------

func (s *Service) ListGrants(ctx context.Context, userID, projectID uuid.UUID) ([]db.ListProjectPermissionGrantsRow, error) {
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyManage)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, permissions.ErrDenied
	}
	return s.Queries.ListProjectPermissionGrants(ctx, projectID)
}

// Grant targets a user directly rather than an org membership, which is what
// allows a personal project to be shared. The consequence is that the org
// member list alone does not answer "who can reach this data".
func (s *Service) Grant(ctx context.Context, userID, projectID, targetUserID uuid.UUID, key string) error {
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyManage)
	if err != nil {
		return err
	}
	if !allowed {
		return permissions.ErrDenied
	}
	if err := s.validKey(ctx, key); err != nil {
		return err
	}
	if _, err := s.Queries.GetUserByID(ctx, targetUserID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	// Re-granting an existing key is a no-op rather than an error, so the
	// checkbox grid can be idempotent.
	_, err = s.Queries.CreateProjectPermissionGrant(ctx, db.CreateProjectPermissionGrantParams{
		ProjectID:     projectID,
		UserID:        targetUserID,
		PermissionKey: key,
		GrantedBy:     userID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	return nil
}

func (s *Service) Revoke(ctx context.Context, userID, projectID, targetUserID uuid.UUID, key string) error {
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyManage)
	if err != nil {
		return err
	}
	if !allowed {
		return permissions.ErrDenied
	}
	return s.Queries.DeleteProjectPermissionGrant(ctx, db.DeleteProjectPermissionGrantParams{
		ProjectID:     projectID,
		UserID:        targetUserID,
		PermissionKey: key,
	})
}

func (s *Service) ListPermissionCatalog(ctx context.Context) ([]db.Permission, error) {
	return s.Queries.ListPermissions(ctx)
}

func (s *Service) validKey(ctx context.Context, key string) error {
	all, err := s.Queries.ListPermissions(ctx)
	if err != nil {
		return err
	}
	for _, p := range all {
		if p.Key == key {
			return nil
		}
	}
	return ErrUnknownKey
}
