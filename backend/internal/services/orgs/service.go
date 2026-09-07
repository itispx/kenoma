// Package orgs holds organization, membership, and invitation logic. Like the
// auth service it imports no net/http, so authorization decisions and the
// rules that protect them stay testable without a request.
//
// Personal organizations are created by the auth service at registration, not
// here: they must land in the same transaction as the user row.
package orgs

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/kenoma/backend/db/sqlc"
	authpkg "github.com/kenoma/backend/internal/auth"
	"github.com/kenoma/backend/internal/config"
	"github.com/kenoma/backend/internal/email"
	"github.com/kenoma/backend/internal/services/permissions"
)

var (
	ErrValidation      = errors.New("validation failed")
	ErrNotFound        = errors.New("not found")
	ErrLastAdmin       = errors.New("organization must keep at least one admin")
	ErrPersonalOrg     = errors.New("personal organizations cannot be modified this way")
	ErrAlreadyMember   = errors.New("already a member of this organization")
	ErrInviteNotValid  = errors.New("invalid or expired invitation")
	ErrInviteDuplicate = errors.New("an invitation for that address is already pending")

	ErrInviteRoleNotAllowed = errors.New("members can only invite members")
)

type Service struct {
	Queries db.Querier
	Checker *permissions.Checker
	Sender  email.Sender
	Cfg     *config.Config
}

func New(queries db.Querier, checker *permissions.Checker, sender email.Sender, cfg *config.Config) *Service {
	return &Service{Queries: queries, Checker: checker, Sender: sender, Cfg: cfg}
}

func validateName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", fmt.Errorf("%w: name is required", ErrValidation)
	}
	return name, nil
}

// Create makes a regular (non-personal) organization with the caller as its
// first admin. Personal organizations are never created through this path.
func (s *Service) Create(ctx context.Context, userID uuid.UUID, rawName string) (db.Organization, error) {
	name, err := validateName(rawName)
	if err != nil {
		return db.Organization{}, err
	}

	org, err := s.Queries.CreateOrganization(ctx, db.CreateOrganizationParams{
		Name:       name,
		IsPersonal: false,
		CreatedBy:  userID,
	})
	if err != nil {
		return db.Organization{}, err
	}
	if _, err := s.Queries.CreateOrganizationMember(ctx, db.CreateOrganizationMemberParams{
		OrganizationID: org.ID,
		UserID:         userID,
		Role:           "admin",
	}); err != nil {
		return db.Organization{}, err
	}
	return org, nil
}

func (s *Service) ListForUser(ctx context.Context, userID uuid.UUID) ([]db.ListOrganizationsForUserRow, error) {
	return s.Queries.ListOrganizationsForUser(ctx, userID)
}

// Get requires membership: an organization's existence is not public. The
// caller's role comes back with it — the client gates its own controls on it,
// and the lookup happens here anyway.
func (s *Service) Get(ctx context.Context, userID, orgID uuid.UUID) (db.Organization, string, error) {
	role, err := s.Checker.RoleInOrg(ctx, userID, orgID)
	if err != nil {
		return db.Organization{}, "", err
	}
	if role == "" {
		return db.Organization{}, "", permissions.ErrDenied
	}
	org, err := s.Queries.GetOrganizationByID(ctx, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Organization{}, "", ErrNotFound
		}
		return db.Organization{}, "", err
	}
	return org, role, nil
}

// UpdateParams is a partial update: a nil field is left alone.
type UpdateParams struct {
	Name             *string
	MembersCanInvite *bool
}

// Update changes organization settings. Admin-only, deliberately: the one
// setting members can be handed is the ability to invite, and handing it over
// is itself an admin act.
func (s *Service) Update(ctx context.Context, userID, orgID uuid.UUID, params UpdateParams) (db.Organization, error) {
	var name pgtype.Text
	if params.Name != nil {
		valid, err := validateName(*params.Name)
		if err != nil {
			return db.Organization{}, err
		}
		name = pgtype.Text{String: valid, Valid: true}
	}
	if _, err := s.requireAdminOnRealOrg(ctx, userID, orgID); err != nil {
		return db.Organization{}, err
	}

	membersCanInvite := pgtype.Bool{}
	if params.MembersCanInvite != nil {
		membersCanInvite = pgtype.Bool{Bool: *params.MembersCanInvite, Valid: true}
	}
	return s.Queries.UpdateOrganization(ctx, db.UpdateOrganizationParams{
		ID:               orgID,
		Name:             name,
		MembersCanInvite: membersCanInvite,
	})
}

func (s *Service) SoftDelete(ctx context.Context, userID, orgID uuid.UUID) error {
	if _, err := s.requireAdminOnRealOrg(ctx, userID, orgID); err != nil {
		return err
	}
	return s.Queries.SoftDeleteOrganization(ctx, orgID)
}

// Restore works on an already-deleted organization, so it deliberately reads
// the row including deleted ones rather than going through Get.
func (s *Service) Restore(ctx context.Context, userID, orgID uuid.UUID) error {
	isAdmin, err := s.Checker.IsOrgAdmin(ctx, userID, orgID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return permissions.ErrDenied
	}
	if _, err := s.Queries.GetDeletedOrganizationByID(ctx, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return s.Queries.RestoreOrganization(ctx, orgID)
}

// requireMemberOnRealOrg rejects outsiders and any attempt to administer a
// personal organization, which has no shared surface of its own. It hands back
// the caller's role so the caller can apply its own admin/member distinction.
func (s *Service) requireMemberOnRealOrg(ctx context.Context, userID, orgID uuid.UUID) (db.Organization, string, error) {
	role, err := s.Checker.RoleInOrg(ctx, userID, orgID)
	if err != nil {
		return db.Organization{}, "", err
	}
	if role == "" {
		return db.Organization{}, "", permissions.ErrDenied
	}
	org, err := s.Queries.GetOrganizationByID(ctx, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Organization{}, "", ErrNotFound
		}
		return db.Organization{}, "", err
	}
	if org.IsPersonal {
		return db.Organization{}, "", ErrPersonalOrg
	}
	return org, role, nil
}

// requireAdminOnRealOrg is the same gate narrowed to admins — renaming,
// deleting, and membership changes never delegate.
func (s *Service) requireAdminOnRealOrg(ctx context.Context, userID, orgID uuid.UUID) (db.Organization, error) {
	org, role, err := s.requireMemberOnRealOrg(ctx, userID, orgID)
	if err != nil {
		return db.Organization{}, err
	}
	if role != permissions.RoleAdmin {
		return db.Organization{}, permissions.ErrDenied
	}
	return org, nil
}

// --- Members ---------------------------------------------------------------

func (s *Service) ListMembers(ctx context.Context, userID, orgID uuid.UUID) ([]db.ListOrganizationMembersRow, error) {
	isMember, err := s.Checker.IsOrgMember(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, permissions.ErrDenied
	}
	return s.Queries.ListOrganizationMembers(ctx, orgID)
}

// UpdateMemberRole refuses to demote the final admin, which would leave the
// organization with nobody able to administer it.
func (s *Service) UpdateMemberRole(ctx context.Context, userID, orgID, memberID uuid.UUID, role string) (db.OrganizationMember, error) {
	if role != "admin" && role != "member" {
		return db.OrganizationMember{}, fmt.Errorf("%w: role must be admin or member", ErrValidation)
	}
	if _, err := s.requireAdminOnRealOrg(ctx, userID, orgID); err != nil {
		return db.OrganizationMember{}, err
	}

	member, err := s.memberInOrg(ctx, orgID, memberID)
	if err != nil {
		return db.OrganizationMember{}, err
	}

	if member.Role == "admin" && role == "member" {
		lastAdmin, err := s.isLastAdmin(ctx, orgID)
		if err != nil {
			return db.OrganizationMember{}, err
		}
		if lastAdmin {
			return db.OrganizationMember{}, ErrLastAdmin
		}
	}

	return s.Queries.UpdateOrganizationMemberRole(ctx, db.UpdateOrganizationMemberRoleParams{
		ID:   memberID,
		Role: role,
	})
}

// RemoveMember also drops that user's grants on the organization's projects.
// Leaving them behind would mean a removed member kept project access, which
// makes removal a lie.
func (s *Service) RemoveMember(ctx context.Context, userID, orgID, memberID uuid.UUID) error {
	if _, err := s.requireAdminOnRealOrg(ctx, userID, orgID); err != nil {
		return err
	}

	member, err := s.memberInOrg(ctx, orgID, memberID)
	if err != nil {
		return err
	}

	if member.Role == "admin" {
		lastAdmin, err := s.isLastAdmin(ctx, orgID)
		if err != nil {
			return err
		}
		if lastAdmin {
			return ErrLastAdmin
		}
	}

	if _, err := s.Queries.DeleteUserGrantsInOrganization(ctx, db.DeleteUserGrantsInOrganizationParams{
		OrganizationID: orgID,
		UserID:         member.UserID,
	}); err != nil {
		return fmt.Errorf("revoke project grants: %w", err)
	}
	return s.Queries.DeleteOrganizationMember(ctx, memberID)
}

// memberInOrg guards against a member id from a different organization being
// passed to an org-scoped route.
func (s *Service) memberInOrg(ctx context.Context, orgID, memberID uuid.UUID) (db.OrganizationMember, error) {
	member, err := s.Queries.GetOrganizationMemberByID(ctx, memberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.OrganizationMember{}, ErrNotFound
		}
		return db.OrganizationMember{}, err
	}
	if member.OrganizationID != orgID {
		return db.OrganizationMember{}, ErrNotFound
	}
	return member, nil
}

func (s *Service) isLastAdmin(ctx context.Context, orgID uuid.UUID) (bool, error) {
	count, err := s.Queries.CountOrganizationAdmins(ctx, orgID)
	if err != nil {
		return false, err
	}
	return count <= 1, nil
}

// --- Invitations -----------------------------------------------------------

// Invite emails an opaque token. Only its hash is stored, the same treatment
// password reset tokens get, so a database dump yields nothing usable.
func (s *Service) Invite(ctx context.Context, userID, orgID uuid.UUID, rawEmail, role string) (db.OrganizationInvitation, error) {
	if role != permissions.RoleAdmin && role != permissions.RoleMember {
		return db.OrganizationInvitation{}, fmt.Errorf("%w: role must be admin or member", ErrValidation)
	}
	addr, err := mail.ParseAddress(strings.TrimSpace(rawEmail))
	if err != nil {
		return db.OrganizationInvitation{}, fmt.Errorf("%w: invalid email format", ErrValidation)
	}

	org, callerRole, err := s.requireMemberOnRealOrg(ctx, userID, orgID)
	if err != nil {
		return db.OrganizationInvitation{}, err
	}
	// Inviting is the one act an admin can delegate, and only halfway: a
	// member who may invite may only ever add another member. Handing out
	// admin stays an admin's decision.
	if callerRole != permissions.RoleAdmin {
		if !org.MembersCanInvite {
			return db.OrganizationInvitation{}, permissions.ErrDenied
		}
		if role != permissions.RoleMember {
			return db.OrganizationInvitation{}, ErrInviteRoleNotAllowed
		}
	}

	// Someone already inside does not need an invitation, and letting one
	// through would silently change their role on accept.
	if existing, err := s.Queries.GetUserByEmail(ctx, addr.Address); err == nil {
		isMember, err := s.Checker.IsOrgMember(ctx, existing.ID, orgID)
		if err != nil {
			return db.OrganizationInvitation{}, err
		}
		if isMember {
			return db.OrganizationInvitation{}, ErrAlreadyMember
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return db.OrganizationInvitation{}, err
	}

	rawToken, err := authpkg.GenerateOpaqueToken()
	if err != nil {
		return db.OrganizationInvitation{}, err
	}

	inv, err := s.Queries.CreateOrganizationInvitation(ctx, db.CreateOrganizationInvitationParams{
		OrganizationID: orgID,
		Email:          addr.Address,
		Role:           role,
		TokenHash:      authpkg.HashToken(rawToken),
		InvitedBy:      userID,
		ExpiresAt:      time.Now().Add(s.Cfg.InvitationTTL),
	})
	if err != nil {
		// The partial unique index means one live invitation per address.
		return db.OrganizationInvitation{}, ErrInviteDuplicate
	}

	link := fmt.Sprintf("%s/invitations/accept?token=%s", s.Cfg.FrontendURL, rawToken)
	body := fmt.Sprintf(
		`<p>You've been invited to join %s on Kenoma. This link expires in %s.</p><p><a href="%s">%s</a></p>`,
		org.Name, s.Cfg.InvitationTTL, link, link,
	)
	if err := s.Sender.Send(ctx, addr.Address, "You've been invited to Kenoma", body); err != nil {
		return db.OrganizationInvitation{}, err
	}
	return inv, nil
}

// ListInvitations is open to every member: who is being brought into the
// organization is not a secret from the people already in it. The caller's
// role comes back so the handler can say which rows that caller may revoke.
func (s *Service) ListInvitations(ctx context.Context, userID, orgID uuid.UUID) ([]db.OrganizationInvitation, string, error) {
	_, role, err := s.requireMemberOnRealOrg(ctx, userID, orgID)
	if err != nil {
		return nil, "", err
	}
	rows, err := s.Queries.ListOrganizationInvitations(ctx, orgID)
	if err != nil {
		return nil, "", err
	}
	return rows, role, nil
}

func (s *Service) RevokeInvitation(ctx context.Context, userID, orgID, inviteID uuid.UUID) error {
	_, role, err := s.requireMemberOnRealOrg(ctx, userID, orgID)
	if err != nil {
		return err
	}
	inv, err := s.Queries.GetOrganizationInvitationByID(ctx, inviteID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if inv.OrganizationID != orgID {
		return ErrNotFound
	}
	// A member takes back what they sent; an admin takes back anything.
	if role != permissions.RoleAdmin && inv.InvitedBy != userID {
		return permissions.ErrDenied
	}
	return s.Queries.RevokeInvitation(ctx, inviteID)
}

// AcceptInvitation is for a user who already has an account. Someone without
// one is joined during registration instead.
func (s *Service) AcceptInvitation(ctx context.Context, userID uuid.UUID, rawToken string) (db.Organization, string, error) {
	if strings.TrimSpace(rawToken) == "" {
		return db.Organization{}, "", ErrInviteNotValid
	}

	inv, err := s.Queries.GetValidInvitationByTokenHash(ctx, authpkg.HashToken(rawToken))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Organization{}, "", ErrInviteNotValid
		}
		return db.Organization{}, "", err
	}

	alreadyMember, err := s.Checker.IsOrgMember(ctx, userID, inv.OrganizationID)
	if err != nil {
		return db.Organization{}, "", err
	}
	if !alreadyMember {
		if _, err := s.Queries.CreateOrganizationMember(ctx, db.CreateOrganizationMemberParams{
			OrganizationID: inv.OrganizationID,
			UserID:         userID,
			Role:           inv.Role,
			InvitedBy:      uuid.NullUUID{UUID: inv.InvitedBy, Valid: true},
		}); err != nil {
			return db.Organization{}, "", err
		}
	}
	if err := s.Queries.MarkInvitationAccepted(ctx, inv.ID); err != nil {
		return db.Organization{}, "", err
	}
	org, err := s.Queries.GetOrganizationByID(ctx, inv.OrganizationID)
	if err != nil {
		return db.Organization{}, "", err
	}
	// An existing member keeps the role they already had, so read it back
	// rather than assuming the invitation's role took effect.
	role, err := s.Checker.RoleInOrg(ctx, userID, inv.OrganizationID)
	if err != nil {
		return db.Organization{}, "", err
	}
	return org, role, nil
}

// PurgeExpiredInvitations deletes invitations that expired longer ago than the
// cutoff, and reports how many rows went. Nothing else removes them, so
// without this the table grows forever: every invite that is never accepted
// stays behind.
//
// The cutoff is passed in rather than computed here so callers control the
// clock, matching the auth service's purge.
func (s *Service) PurgeExpiredInvitations(ctx context.Context, before time.Time) (int64, error) {
	return s.Queries.DeleteExpiredInvitations(ctx, before)
}
