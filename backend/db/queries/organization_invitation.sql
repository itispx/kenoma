-- name: CreateOrganizationInvitation :one
INSERT INTO organization_invitation (organization_id, email, role, token_hash, invited_by, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetValidInvitationByTokenHash :one
SELECT * FROM organization_invitation
WHERE token_hash = $1
  AND accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > now();

-- name: ListPendingInvitationsForEmail :many
SELECT * FROM organization_invitation
WHERE lower(email) = lower($1)
  AND accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > now();

-- name: ListOrganizationInvitations :many
SELECT * FROM organization_invitation
WHERE organization_id = $1
  AND accepted_at IS NULL
  AND revoked_at IS NULL
ORDER BY created_at DESC;

-- name: GetOrganizationInvitationByID :one
SELECT * FROM organization_invitation
WHERE id = $1;

-- name: MarkInvitationAccepted :exec
UPDATE organization_invitation
SET accepted_at = now()
WHERE id = $1;

-- name: RevokeInvitation :exec
UPDATE organization_invitation
SET revoked_at = now()
WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL;

-- name: DeleteExpiredInvitations :execrows
DELETE FROM organization_invitation
WHERE expires_at < $1;
