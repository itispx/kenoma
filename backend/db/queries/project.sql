-- name: CreateProject :one
INSERT INTO project (organization_id, name, created_by)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetProjectByID :one
SELECT * FROM project
WHERE id = $1 AND deleted_at IS NULL;

-- name: GetProjectByIDIncludingDeleted :one
SELECT * FROM project
WHERE id = $1;

-- Org admins see every project in the org. Everyone else sees only what they
-- hold a grant on, so membership alone conveys no visibility.
-- name: ListProjectsForUserInOrg :many
SELECT DISTINCT p.*
FROM project p
WHERE p.organization_id = $1
  AND p.deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM organization_member m
      WHERE m.organization_id = p.organization_id
        AND m.user_id = $2
        AND m.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM project_permission_grant g
      WHERE g.project_id = p.id AND g.user_id = $2
    )
  )
ORDER BY p.created_at DESC;

-- Org admins see every project the org has taken out, so they can find and
-- restore one. Nobody else can see deleted projects at all — membership alone
-- conveys no visibility, and the restore path that feeds off this list is
-- admin-only too.
-- name: ListDeletedProjectsForOrg :many
SELECT *
FROM project
WHERE organization_id = $1 AND deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- name: UpdateProjectName :one
UPDATE project
SET name = $2, updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProject :exec
UPDATE project
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: RestoreProject :exec
UPDATE project
SET deleted_at = NULL, updated_at = now()
WHERE id = $1;
