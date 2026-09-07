-- name: CreateOrganization :one
INSERT INTO organization (name, is_personal, created_by)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetOrganizationByID :one
SELECT * FROM organization
WHERE id = $1 AND deleted_at IS NULL;

-- name: ListOrganizationsForUser :many
SELECT o.*, m.role
FROM organization o
JOIN organization_member m ON m.organization_id = o.id
WHERE m.user_id = $1 AND o.deleted_at IS NULL
ORDER BY o.is_personal DESC, o.name;

-- name: UpdateOrganization :one
UPDATE organization
SET name = coalesce(sqlc.narg('name'), name),
    members_can_invite = coalesce(sqlc.narg('members_can_invite'), members_can_invite),
    updated_at = now()
WHERE id = sqlc.arg('id') AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteOrganization :exec
UPDATE organization
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: RestoreOrganization :exec
UPDATE organization
SET deleted_at = NULL, updated_at = now()
WHERE id = $1;

-- name: GetDeletedOrganizationByID :one
SELECT * FROM organization
WHERE id = $1;
