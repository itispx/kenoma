-- name: CreateOrganizationMember :one
INSERT INTO organization_member (organization_id, user_id, role, invited_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetOrganizationMember :one
SELECT * FROM organization_member
WHERE organization_id = $1 AND user_id = $2;

-- name: GetOrganizationMemberByID :one
SELECT * FROM organization_member
WHERE id = $1;

-- name: ListOrganizationMembers :many
SELECT m.*, u.email, u.name
FROM organization_member m
JOIN user_account u ON u.id = m.user_id
WHERE m.organization_id = $1
ORDER BY m.joined_at;

-- name: CountOrganizationAdmins :one
SELECT count(*) FROM organization_member
WHERE organization_id = $1 AND role = 'admin';

-- name: CountOrganizationMembers :one
SELECT count(*) FROM organization_member
WHERE organization_id = $1;

-- name: UpdateOrganizationMemberRole :one
UPDATE organization_member
SET role = $2
WHERE id = $1
RETURNING *;

-- name: DeleteOrganizationMember :exec
DELETE FROM organization_member
WHERE id = $1;
